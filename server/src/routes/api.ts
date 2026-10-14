import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { findGroupById, findUserById, listAllUsers, listGroupMembers, setUsersActive } from '../db/users.js'
import { insertEvent, listEventsForUser } from '../db/events.js'
import { disconnectUsers, publishEvent } from '../realtime/index.js'
import { revokeUserRefreshTokens } from '../auth/tokens.js'
import type { MeResponse } from '../../../shared/types.js'

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

// ---- 관리자: 계정 활성/비활성 ----
// 진행자(admin)/프레젠테이션(presenter) 계정은 PIN 을 그대로 쓰므로 토글 대상에서 제외한다.
apiRouter.get('/admin/users', requireRole('admin'), (_req, res) => {
  res.json({ users: listAllUsers() })
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
