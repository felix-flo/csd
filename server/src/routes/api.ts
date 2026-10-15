import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/middleware.js'
import {
  findGroupById,
  findUserById,
  generatePin,
  listAllUsers,
  listGroupMembers,
  listGroups,
  setOwnName,
  setUserPin,
  setUsersActive,
  updateUserName,
} from '../db/users.js'
import { applyRoster } from '../db/roster.js'
import { getDocument, restoreDocument, updateDocument } from '../db/documents.js'
import { deleteEvents, insertEvent, listEventsForUser } from '../db/events.js'
import { disconnectUsers, publishEvent } from '../realtime/index.js'
import { revokeUserRefreshTokens } from '../auth/tokens.js'
import type { EventType, MeResponse } from '../../../shared/types.js'

export const apiRouter = Router()

apiRouter.use(requireAuth)

apiRouter.get('/me', (req, res) => {
  const user = findUserById(req.auth!.sub)
  if (!user) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  const body: MeResponse = { user, group: user.groupId ? findGroupById(user.groupId) : null }
  res.json(body)
})

const nameSchema = z.object({ name: z.string().trim().min(1).max(20) })

/** 첫 로그인 때 본인 이름 설정 (1회). 이후 변경은 관리자만 가능 */
apiRouter.post('/me/name', (req, res) => {
  const parsed = nameSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues })
    return
  }
  if (!setOwnName(req.auth!.sub, parsed.data.name)) {
    res.status(409).json({ error: 'name_already_set' })
    return
  }
  res.json({ user: findUserById(req.auth!.sub) })
})

/** 내 그룹 정보 (멤버 목록). 재화 등은 룰 확정 후 추가 */
apiRouter.get('/group', requireRole('member'), (req, res) => {
  const groupId = req.auth!.groupId
  const group = groupId ? findGroupById(groupId) : null
  if (!group) {
    res.status(404).json({ error: 'no_group' })
    return
  }
  res.json({ group, members: listGroupMembers(group.id) })
})

/** 재접속 시 놓친 이벤트 replay (HTTP 버전; Socket 'replay' 와 동일) */
apiRouter.get('/events', (req, res) => {
  const after = Number(req.query.after ?? 0)
  const user = findUserById(req.auth!.sub)
  if (!user) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  res.json({ events: listEventsForUser(user, Number.isFinite(after) ? after : 0) })
})

// ---- 개발용: 실시간 파이프라인 확인을 위한 공지 전송. 실제 관리자 기능은 룰 확정 후 구현 ----
const noticeSchema = z.object({
  scope: z.enum(['all', 'role', 'group', 'user']),
  targetId: z.number().int().nullable().optional(),
  targetRole: z.enum(['admin', 'presenter', 'member']).nullable().optional(),
  message: z.string().min(1).max(500),
})

apiRouter.post('/admin/notice', requireRole('admin'), (req, res) => {
  const parsed = noticeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues })
    return
  }
  const { scope, targetId, targetRole, message } = parsed.data
  const ev = insertEvent({
    type: 'notice',
    scope,
    targetId: targetId ?? null,
    targetRole: targetRole ?? null,
    payload: { message },
    createdBy: req.auth!.sub,
  })
  publishEvent(ev)
  res.status(201).json({ event: ev })
})

// ---- 관리자: 알림 기록 초기화 (기본 공지만) ----
const clearEventsSchema = z.object({
  types: z.array(z.enum(['notice', 'system', 'document.updated'])).min(1).max(10).optional(),
  before: z.number().int().positive().nullable().optional(),
})

apiRouter.delete('/admin/events', requireRole('admin'), (req, res) => {
  const parsed = clearEventsSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues })
    return
  }
  const types: EventType[] = parsed.data.types ?? ['notice']
  const before = parsed.data.before ?? null
  const deleted = deleteEvents(types, before)
  // 접속 중인 화면이 피드를 비우도록 system 이벤트로 알린다 (이 이벤트 자체는 남는다)
  const ev = insertEvent({
    type: 'system',
    scope: 'all',
    payload: { kind: 'events.cleared', types, before, deleted, message: '공지 기록이 초기화되었습니다' },
    createdBy: req.auth!.sub,
  })
  publishEvent(ev)
  res.json({ deleted, event: ev })
})

// ---- 관리자: 계정 활성/비활성 ----
// 진행자(admin)/프레젠테이션(presenter) 계정은 PIN 을 그대로 쓰므로 토글 대상에서 제외한다.
apiRouter.get('/admin/users', requireRole('admin'), (_req, res) => {
  res.json({ users: listAllUsers(), groups: listGroups() })
})

const activeSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  active: z.boolean(),
})

apiRouter.post('/admin/users/active', requireRole('admin'), (req, res) => {
  const parsed = activeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues })
    return
  }
  const { active } = parsed.data
  const byId = new Map(listAllUsers().map((u) => [u.id, u]))
  const ids = parsed.data.ids.filter((id) => byId.get(id)?.role === 'member')
  const changed = setUsersActive(ids, active)
  if (!active) {
    // 비활성화: 재로그인 불가 + 이미 로그인된 세션도 즉시 종료
    revokeUserRefreshTokens(ids)
    disconnectUsers(ids)
  }
  res.json({ changed, users: listAllUsers() })
})

// ---- 관리자: 인원 구성 / 이름 / PIN ----
const rosterSchema = z.object({
  groups: z.number().int().min(1).max(26),
  participants: z.number().int().min(0).max(200),
  staff: z.number().int().min(1).max(20),
})

apiRouter.post('/admin/roster', requireRole('admin'), (req, res) => {
  const parsed = rosterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues })
    return
  }
  const result = applyRoster({ ...parsed.data, keepAdminId: req.auth!.sub })
  res.json({ ...result, users: listAllUsers(), groups: listGroups() })
})

function targetUser(req: { params: Record<string, string | string[] | undefined> }) {
  const id = Number(req.params.id)
  return Number.isInteger(id) ? listAllUsers().find((u) => u.id === id) ?? null : null
}

apiRouter.post('/admin/users/:id/name', requireRole('admin'), (req, res) => {
  const parsed = nameSchema.safeParse(req.body)
  const user = targetUser(req)
  if (!parsed.success || !user) {
    res.status(parsed.success ? 404 : 400).json({ error: parsed.success ? 'not_found' : 'bad_request' })
    return
  }
  updateUserName(user.id, parsed.data.name)
  res.json({ users: listAllUsers() })
})

/** PIN 리셋: 새 랜덤 PIN 발급 + 기존 세션 종료. 본인과 프레젠테이션 계정은 제외 */
apiRouter.post('/admin/users/:id/reset-pin', requireRole('admin'), (req, res) => {
  const user = targetUser(req)
  if (!user) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  if (user.id === req.auth!.sub || user.role === 'presenter') {
    res.status(403).json({ error: 'pin_fixed' })
    return
  }
  const pin = generatePin()
  setUserPin(user.id, pin)
  revokeUserRefreshTokens([user.id])
  disconnectUsers([user.id])
  res.json({ pin, users: listAllUsers() })
})

// ---- 문서 (룰 등): 조회는 모든 역할, 수정은 관리자 ----
const slugSchema = z.string().regex(/^[a-z][a-z0-9-]{0,30}$/)
const documentSchema = z.object({
  title: z.string().trim().min(1).max(50),
  markdown: z.string().max(50_000),
})

apiRouter.get('/documents/:slug', (req, res) => {
  const slug = slugSchema.safeParse(req.params.slug)
  const doc = slug.success ? getDocument(slug.data) : null
  if (!doc) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  res.json({ document: doc })
})

function announceDocument(doc: { slug: string; title: string }, userId: number) {
  const ev = insertEvent({
    type: 'document.updated',
    scope: 'all',
    payload: { slug: doc.slug, title: doc.title, message: `"${doc.title}" 이(가) 갱신되었습니다` },
    createdBy: userId,
  })
  publishEvent(ev)
}

apiRouter.put('/admin/documents/:slug', requireRole('admin'), (req, res) => {
  const slug = slugSchema.safeParse(req.params.slug)
  const parsed = documentSchema.safeParse(req.body)
  if (!slug.success || !parsed.success) {
    res.status(400).json({ error: 'bad_request' })
    return
  }
  const doc = updateDocument(slug.data, parsed.data, req.auth!.sub)
  if (!doc) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  announceDocument(doc, req.auth!.sub)
  res.json({ document: doc })
})

apiRouter.post('/admin/documents/:slug/restore', requireRole('admin'), (req, res) => {
  const slug = slugSchema.safeParse(req.params.slug)
  const doc = slug.success ? restoreDocument(slug.data, req.auth!.sub) : null
  if (!doc) {
    res.status(404).json({ error: 'no_previous_version' })
    return
  }
  announceDocument(doc, req.auth!.sub)
  res.json({ document: doc })
})
