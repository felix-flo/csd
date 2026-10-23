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
import { applyRoster, RosterError } from '../db/roster.js'
import { createTeam, deleteTeam, ensureLeader, moveMember, setLeader, teamNameExists, updateTeam } from '../db/teams.js'
import { getGameRow } from '../db/game.js'
import { allLivesDone } from '../db/life.js'
import {
  GLOBAL_RULES_SLUG, getDocument, getTeamRule, listTeamRules, restoreDocument, teamRuleSlug, updateDocument,
} from '../db/documents.js'
import { deleteEvents, insertEvent, listEventsForUser, listRecentEventsForUser } from '../db/events.js'
import { disconnectUsers, moveUserRooms, publishEvent, signalLobby } from '../realtime/index.js'
import { revokeUserRefreshTokens } from '../auth/tokens.js'
import { gameRouter } from './game.js'
import { HEX_COLOR, isPaletteColor } from '../../../shared/teams.js'
import { isBeforeStart, teamLetter } from '../../../shared/game.js'
import type { DocumentInfo, EventType, GroupInfo, MeResponse, RulesResponse } from '../../../shared/types.js'

export const apiRouter = Router()

apiRouter.use(requireAuth)
apiRouter.use(gameRouter)

apiRouter.get('/me', (req, res) => {
  const user = req.auth!.user
  const body: MeResponse = { user, group: user.groupId ? findGroupById(user.groupId) : null }
  res.json(body)
})

/** 팀 목록 (id, code, name, color). 모든 역할. 알림 피드·거래 화면에서 상대 팀 이름·색 표시용 */
apiRouter.get('/teams', (_req, res) => {
  res.json({ teams: listGroups() })
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
  // 준비 상태: 관리자 화면의 "참가자 PIN" 상태(이름 입력함)를 바로 갱신
  if (req.auth!.role === 'member' && getGameRow().status === 'ready') signalLobby()
  res.json({ user: findUserById(req.auth!.sub) })
})

/** 내 팀 정보 (팀원 목록). 게임 시작 전에는 주지 않는다 (참가자는 "게임 준비중 입니다." 만 본다) */
apiRouter.get('/group', requireRole('member'), (req, res) => {
  if (isBeforeStart(getGameRow().status)) {
    res.status(409).json({ error: 'not_started' })
    return
  }
  const groupId = req.auth!.groupId
  const group = groupId ? findGroupById(groupId) : null
  if (!group) {
    res.status(404).json({ error: 'no_group' })
    return
  }
  res.json({ group, members: listGroupMembers(group.id) })
})

/**
 * 이벤트 조회.
 * - ?recent=N : 최근 N건 (피드 초기 표시용, 최대 200)
 * - ?after=ID : ID 이후 것 (재접속 replay 의 HTTP 버전; Socket 'replay' 와 동일)
 */
apiRouter.get('/events', (req, res) => {
  const user = findUserById(req.auth!.sub)
  if (!user) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  if (req.query.recent !== undefined) {
    const n = Math.min(Math.max(Number(req.query.recent) || 50, 1), 200)
    res.json({ events: listRecentEventsForUser(user, n) })
    return
  }
  const after = Number(req.query.after ?? 0)
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
  types: z.array(z.enum(['notice', 'system', 'document.updated', 'game', 'trade'])).min(1).max(10).optional(),
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

/** 라이프 제출 단계 중 이번 변경(탈락·팀 이동)으로 남은 팀이 모두 제출 불필요(팀원 1명 이하)가 되면 완료 알림 */
function livesDoneBefore(): boolean | null {
  const g = getGameRow()
  return g.status === 'running' && g.phase === 'life' ? allLivesDone(g.day) : null
}
function announceLivesIfNowDone(before: boolean | null, by: number) {
  if (before !== false) return
  const g = getGameRow()
  if (!allLivesDone(g.day)) return
  publishEvent(insertEvent({ type: 'game', scope: 'all', payload: { kind: 'life.all_done', message: '모든 팀의 라이프가 제출되었습니다.', day: g.day }, createdBy: by }))
}

apiRouter.post('/admin/users/active', requireRole('admin'), (req, res) => {
  const parsed = activeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues })
    return
  }
  const { active } = parsed.data
  const byId = new Map(listAllUsers().map((u) => [u.id, u]))
  // 실제로 상태가 바뀌는 참가자만 (이미 같은 상태면 알림도 보내지 않는다)
  const targets = parsed.data.ids
    .map((id) => byId.get(id))
    .filter((u): u is NonNullable<typeof u> => !!u && u.role === 'member' && u.active !== active)
  const ids = targets.map((u) => u.id)
  const livesBefore = livesDoneBefore()
  const changed = setUsersActive(ids, active)
  if (!active) {
    // 탈락: 재로그인 불가 + 이미 로그인된 세션도 즉시 종료 → 팀 재화·알림을 받지 못한다
    revokeUserRefreshTokens(ids)
    disconnectUsers(ids)
  }
  // 팀별로 묶어 리더 승계 + 팀원들에게 알림 1건
  const byTeam = new Map<number, typeof targets>()
  for (const u of targets) {
    if (u.groupId == null) continue
    byTeam.set(u.groupId, [...(byTeam.get(u.groupId) ?? []), u])
  }
  for (const [teamId, list] of byTeam) {
    ensureLeader(teamId)
    const names = list.map((u) => u.name)
    const ev = insertEvent({
      type: 'system',
      scope: 'group',
      targetId: teamId,
      payload: {
        kind: 'members.active',
        active,
        userIds: list.map((u) => u.id),
        names,
        message: `${names.join(', ')} 님이 ${active ? '복귀했습니다' : '탈락했습니다'}`,
      },
      createdBy: req.auth!.sub,
    })
    publishEvent(ev)
  }
  announceLivesIfNowDone(livesBefore, req.auth!.sub)
  signalLobby()
  res.json({ changed, users: listAllUsers() })
})

// ---- 관리자: 팀 추가 / 수정 / 삭제 ----
const teamColor = z.string().regex(HEX_COLOR).refine(isPaletteColor, { message: 'not_in_palette' })
const teamCreateSchema = z.object({ name: z.string().trim().min(1).max(20), color: teamColor })
const teamPatchSchema = z.object({ name: z.string().trim().min(1).max(20).optional(), color: teamColor.optional() })

function announceTeams(userId: number, action: 'created' | 'updated' | 'deleted', team: GroupInfo) {
  const ev = insertEvent({
    type: 'system',
    scope: 'all',
    payload: { kind: 'teams.updated', action, teamId: team.id, name: team.name, message: `팀 목록이 변경되었습니다 (${team.name})` },
    createdBy: userId,
  })
  publishEvent(ev)
}

apiRouter.post('/admin/teams', requireRole('admin'), (req, res) => {
  const parsed = teamCreateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues })
    return
  }
  if (teamNameExists(parsed.data.name)) {
    res.status(409).json({ error: 'team_name_taken' })
    return
  }
  const team = createTeam(parsed.data)
  announceTeams(req.auth!.sub, 'created', team)
  signalLobby()
  res.status(201).json({ team, teams: listGroups(), users: listAllUsers() })
})

apiRouter.patch('/admin/teams/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const parsed = teamPatchSchema.safeParse(req.body)
  const team = Number.isInteger(id) ? findGroupById(id) : null
  if (!parsed.success || !team) {
    res.status(parsed.success ? 404 : 400).json({ error: parsed.success ? 'not_found' : 'bad_request' })
    return
  }
  if (parsed.data.name && teamNameExists(parsed.data.name, team.id)) {
    res.status(409).json({ error: 'team_name_taken' })
    return
  }
  updateTeam(team.id, parsed.data)
  const updated = findGroupById(team.id)!
  announceTeams(req.auth!.sub, 'updated', updated)
  res.json({ team: updated, teams: listGroups(), users: listAllUsers() })
})

/** 소속 참가자(활성·비활성 포함)가 0명인 팀만 삭제할 수 있다 */
apiRouter.delete('/admin/teams/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const team = Number.isInteger(id) ? findGroupById(id) : null
  if (!team) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  const result = deleteTeam(team.id)
  if (result !== 'ok') {
    res.status(result === 'not_empty' ? 409 : 404).json({ error: result === 'not_empty' ? 'team_not_empty' : 'not_found' })
    return
  }
  announceTeams(req.auth!.sub, 'deleted', team)
  signalLobby()
  res.json({ teams: listGroups(), users: listAllUsers() })
})

// ---- 관리자: 진행자 수 / 팀 이동 / 리더 지정 / 이름 / PIN ----
// 진행자는 늘리기만 한다. 참가자 PIN 은 게임 설정의 팀별 최대 인원으로 만든다 (초기셋팅완료)
const rosterSchema = z.object({
  staff: z.number().int().min(1).max(20),
})

apiRouter.post('/admin/roster', requireRole('admin'), (req, res) => {
  const parsed = rosterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'bad_request', issues: parsed.error.issues })
    return
  }
  try {
    const result = applyRoster(parsed.data)
    res.json({ ...result, users: listAllUsers(), groups: listGroups() })
  } catch (e) {
    if (e instanceof RosterError) {
      res.status(400).json({ error: e.code, detail: e.detail })
      return
    }
    throw e
  }
})

/**
 * 참가자 팀 이동. 재로그인 없이 즉시 반영된다 (팀은 토큰이 아니라 DB 기준).
 * 소켓 룸을 먼저 옮긴 뒤 이전 팀·새 팀에 알림을 1건씩 보내므로 이동한 본인은 새 팀 알림만 받는다.
 */
const moveSchema = z.object({ teamId: z.number().int().positive() })

apiRouter.post('/admin/users/:id/team', requireRole('admin'), (req, res) => {
  const parsed = moveSchema.safeParse(req.body)
  const user = targetUser(req)
  if (!parsed.success || !user) {
    res.status(parsed.success ? 404 : 400).json({ error: parsed.success ? 'not_found' : 'bad_request' })
    return
  }
  if (user.role !== 'member') {
    res.status(403).json({ error: 'not_member' })
    return
  }
  const livesBefore = livesDoneBefore()
  const moved = moveMember(user.id, parsed.data.teamId)
  if (moved === 'not_found') {
    res.status(404).json({ error: 'not_found' })
    return
  }
  if (moved === 'same_team') {
    res.json({ users: listAllUsers() })
    return
  }
  const { from, to } = moved
  moveUserRooms(user.id, from?.id ?? null, to.id)
  // 시작 전에는 참가자에게 실제 팀 이름 대신 A, B, C… 로 알린다
  const label = (t: GroupInfo | null) => {
    if (!t) return '팀 없음'
    if (!isBeforeStart(getGameRow().status)) return t.name
    return `${teamLetter(listGroups().findIndex((g) => g.id === t.id))} 팀`
  }
  const payload = {
    kind: 'member.moved',
    userId: user.id,
    userName: user.name,
    fromTeamId: from?.id ?? null,
    fromTeamName: from?.name ?? null,
    toTeamId: to.id,
    toTeamName: to.name,
    message: `${user.name} 님이 팀을 이동했습니다 (${label(from)} → ${label(to)})`,
  }
  for (const teamId of [from?.id, to.id]) {
    if (teamId == null) continue
    publishEvent(insertEvent({ type: 'system', scope: 'group', targetId: teamId, payload, createdBy: req.auth!.sub }))
  }
  announceLivesIfNowDone(livesBefore, req.auth!.sub)
  signalLobby()
  res.json({ users: listAllUsers() })
})

/** 리더 지정 (게임 시작 전에는 관리자가 팀마다 지정해야 시작할 수 있다. 진행 중에도 수동 교체용으로 쓸 수 있다) */
apiRouter.post('/admin/users/:id/leader', requireRole('admin'), (req, res) => {
  const user = targetUser(req)
  if (!user || user.role !== 'member') {
    res.status(404).json({ error: 'not_found' })
    return
  }
  const team = setLeader(user.id)
  if (typeof team === 'string') {
    res.status(team === 'not_found' ? 404 : 409).json({ error: team })
    return
  }
  publishEvent(insertEvent({
    type: 'system',
    scope: 'group',
    targetId: team.id,
    payload: { kind: 'leader.set', userId: user.id, message: `${user.name} 님이 리더로 지정되었습니다` },
    createdBy: req.auth!.sub,
  }))
  // 다른 관리자 화면의 시작 점검(리더 미지정 팀)도 바로 갱신
  signalLobby()
  res.json({ users: listAllUsers() })
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
  // 프레젠테이션 팀 현황 명단도 갱신
  signalLobby()
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

/** 전체 공개 문서만 (팀 룰은 GET /rules 로 권한을 확인해 준다) */
apiRouter.get('/documents/:slug', (req, res) => {
  const slug = slugSchema.safeParse(req.params.slug)
  const doc = slug.success ? getDocument(slug.data) : null
  if (!doc || doc.teamId != null) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  res.json({ document: doc })
})

/**
 * 갱신 알림: 전체 룰은 전체, 팀 룰은 그 팀(+관리자)에게만 — 다른 팀은 팀 룰이 바뀐 사실도 모른다.
 * 게임 시작 전에는 팀원에게 팀 룰을 보여 주지 않고 팀 이름도 숨기므로(A, B …) 팀 룰 알림은 진행자에게만
 */
function announceDocument(doc: DocumentInfo, userId: number) {
  const team = doc.teamId != null
  const hidden = team && isBeforeStart(getGameRow().status)
  const ev = insertEvent({
    type: 'document.updated',
    scope: hidden ? 'role' : team ? 'group' : 'all',
    targetId: hidden ? null : doc.teamId,
    targetRole: hidden ? 'admin' : null,
    payload: { slug: doc.slug, title: doc.title, teamId: doc.teamId, message: `"${doc.title}" 이(가) 갱신되었습니다` },
    createdBy: userId,
  })
  publishEvent(ev)
}

/**
 * 룰북 (docs/98). 참가자는 전체 룰 + 자기 팀 룰(게임 시작 후 — 시작 전에는 팀 이름을 A, B… 로 숨기므로),
 * 프레젠테이션은 전체 룰만, 관리자는 모든 팀 룰까지. 팀은 토큰이 아니라 DB 기준
 */
apiRouter.get('/rules', (req, res) => {
  const global = getDocument(GLOBAL_RULES_SLUG)!
  const role = req.auth!.role
  const body: RulesResponse = { global, team: null }
  if (role === 'admin') body.teams = listTeamRules()
  if (role === 'member') {
    const user = findUserById(req.auth!.sub)
    if (user?.groupId != null && !isBeforeStart(getGameRow().status)) body.team = getTeamRule(user.groupId)
  }
  res.json(body)
})

const teamIdParam = z.coerce.number().int().positive()

apiRouter.put('/admin/rules/team/:teamId', requireRole('admin'), (req, res) => {
  const teamId = teamIdParam.safeParse(req.params.teamId)
  const parsed = z.object({ markdown: z.string().max(50_000) }).safeParse(req.body)
  if (!teamId.success || !parsed.success) {
    res.status(400).json({ error: 'bad_request' })
    return
  }
  const current = getTeamRule(teamId.data)
  const doc = current ? updateDocument(current.slug, { title: '', markdown: parsed.data.markdown }, req.auth!.sub) : null
  if (!doc) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  announceDocument(doc, req.auth!.sub)
  res.json({ document: doc })
})

apiRouter.post('/admin/rules/team/:teamId/restore', requireRole('admin'), (req, res) => {
  const teamId = teamIdParam.safeParse(req.params.teamId)
  const doc = teamId.success ? restoreDocument(teamRuleSlug(teamId.data), req.auth!.sub) : null
  if (!doc) {
    res.status(404).json({ error: 'no_previous_version' })
    return
  }
  announceDocument(doc, req.auth!.sub)
  res.json({ document: doc })
})

apiRouter.put('/admin/documents/:slug', requireRole('admin'), (req, res) => {
  const slug = slugSchema.safeParse(req.params.slug)
  const parsed = documentSchema.safeParse(req.body)
  if (!slug.success || !parsed.success) {
    res.status(400).json({ error: 'bad_request' })
    return
  }
  // 팀 룰은 /admin/rules/team/:teamId 로만 (제목 자동·알림 범위가 다르다)
  const doc = getDocument(slug.data)?.teamId == null ? updateDocument(slug.data, parsed.data, req.auth!.sub) : null
  if (!doc) {
    res.status(404).json({ error: 'not_found' })
    return
  }
  announceDocument(doc, req.auth!.sub)
  res.json({ document: doc })
})

apiRouter.post('/admin/documents/:slug/restore', requireRole('admin'), (req, res) => {
  const slug = slugSchema.safeParse(req.params.slug)
  const doc = slug.success && getDocument(slug.data)?.teamId == null ? restoreDocument(slug.data, req.auth!.sub) : null
  if (!doc) {
    res.status(404).json({ error: 'no_previous_version' })
    return
  }
  announceDocument(doc, req.auth!.sub)
  res.json({ document: doc })
})
