import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/middleware.js'
import { findGroupById, findUserById, listGroupMembers } from '../db/users.js'
import { insertEvent, listEventsForUser } from '../db/events.js'
import { publishEvent } from '../realtime/index.js'
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
