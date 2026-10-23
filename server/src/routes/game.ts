/**
 * 게임 진행 API (docs/95.게임진행_설계.md). apiRouter 아래에 붙으므로 requireAuth 는 이미 적용돼 있다.
 * - 모든 역할: GET /game (일차·단계·초기 재화 합계·발표된 등수)
 * - 프레젠테이션·관리자: GET /game/roster 팀 현황 (팀원 명단·탈락, 시작 후에만)
 * - 참가자  : GET /game/team, 투표, 라이프 제출(리더), 거래(리더)
 * - 관리자  : /admin/game/* 설정·초기셋팅완료·설정으로 되돌리기·시작·다음 단계·종료·등수 발표·리셋, 재화 조정, 원조, 동표 지정, 거래 강제 취소
 * - 참가자(준비 상태): POST /game/join 팀 선택. 시작 전에는 팀 게임 정보를 주지 않는다
 * - 보석·골드 발행 (docs/97): 화이트·옐로우 리더 POST /issue/request, 관리자 POST /admin/issue/:id/decide
 * 상태 변화는 events 에 기록 후 Socket.IO 로 알린다. 클라이언트는 game/trade 이벤트를 받으면 상태를 다시 조회한다.
 */
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth/middleware.js'
import { findGroupById, findUserById, listGroups } from '../db/users.js'
import { isBeforeStart } from '../../../shared/game.js'
import { GameError } from '../db/gameError.js'
import {
  activeMemberCount, advance, endGame, getGameRow, getGameState, getPrep, getPublicRoster, getSettings, joinTeam, markAidUsed, prepareGame, publishResults,
  requireRunning, resetGame, revertToSetup, saveSettings, startGame, takeFromLifeReserve,
} from '../db/game.js'
import { applyDeltas, describeDeltas, getAllResources, getTeamResources, listLedger, negate } from '../db/resources.js'
import { allElectionsDone, castVote, getElection, resolveTie, type FinalizeResult } from '../db/election.js'
import { allLivesDone, getLifeSubmission, submitLife } from '../db/life.js'
import {
  acceptOffer, cancelActiveTrade, cancelTrade, getActiveTrade, getActiveTradeForTeam, payCredit, proposeOffer, requestTrade, respondTrade,
} from '../db/trades.js'
import { decideIssue, getAdminIssues, getTeamIssue, requestIssue } from '../db/issuance.js'
import { db } from '../db/index.js'
import { insertEvent } from '../db/events.js'
import { disconnectUsers, moveUserRooms, publishEvent, signalLobby } from '../realtime/index.js'
import { revokeUserRefreshTokens } from '../auth/tokens.js'
import { emptyResources, josa, PHASE_LABELS, PHASES, RESOURCE_KINDS, RESOURCE_LABELS } from '../../../shared/game.js'
import type { AdminGameView, IssueRequestView, Resources, TeamGameView, TradeView } from '../../../shared/game.js'
import type { EventScope, GameKind } from '../../../shared/types.js'

export const gameRouter = Router()

// ---- 공용 ----

const amount = z.number().int().min(0).max(100_000)
const resourcesSchema = z.object({ gem: amount, gold: amount, life: amount, credit: amount })
const deltaSchema = z.object(Object.fromEntries(RESOURCE_KINDS.map((k) => [k, z.number().int().min(-100_000).max(100_000).optional()]))) as z.ZodType<
  Partial<Resources>
>

/** 핸들러 래퍼: zod 400, GameError → { error, detail } */
function handle<T>(schema: z.ZodType<T> | null, fn: (req: Request, res: Response, body: T) => void) {
  return (req: Request, res: Response) => {
    let body = undefined as T
    if (schema) {
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'bad_request', issues: parsed.error.issues })
        return
      }
      body = parsed.data
    }
    try {
      fn(req, res, body)
    } catch (e) {
      if (e instanceof GameError) {
        res.status(e.status).json({ error: e.code, detail: e.detail })
        return
      }
      throw e
    }
  }
}

function emit(type: 'game' | 'trade', scope: EventScope, targetId: number | null, kind: GameKind | string, message: string, by: number | null, extra: Record<string, unknown> = {}) {
  publishEvent(insertEvent({ type, scope, targetId, payload: { kind, message, ...extra }, createdBy: by }))
}

function teamName(id: number | null | undefined): string {
  return (id != null && findGroupById(id)?.name) || '알 수 없는 팀'
}

function userName(id: number | null | undefined): string {
  if (id == null) return '-'
  return (db.prepare('SELECT name FROM users WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? `#${id}`
}

/** 탈락 처리된 계정의 세션 종료 (라이프 탈락·테스트 계정 제외·리셋 복원) */
function endSessions(ids: number[]) {
  if (ids.length === 0) return
  revokeUserRefreshTokens(ids)
  disconnectUsers(ids)
}

function announceElection(day: number, teamId: number, r: FinalizeResult, by: number) {
  if (r.status === 'tie') {
    emit('game', 'group', teamId, 'election.tie', `리더 투표 동표 (${r.tied.map(userName).join(', ')}) — 진행자가 리더를 지정합니다`, by, { day })
    return
  }
  const who = r.leaderId != null ? `${userName(r.leaderId)} 님` : '없음'
  const how = r.changed ? `새 리더 ${who}` : `리더 ${who} 재신임`
  emit('game', 'group', teamId, 'election.done', `리더 선출 결과: ${how}${r.votes ? ` (${r.votes}표)` : ''}`, by, { day, leaderId: r.leaderId })
  // 팀 알림을 받지 않는 프레젠테이션의 팀 현황(리더 표시) 갱신
  signalLobby()
}

function announceAllLeaders(day: number, by: number) {
  emit('game', 'all', null, 'election.all_done', '모든팀의 리더 선출이 완료되었습니다.', by, { day })
}

function announceTrade(t: TradeView, kind: string, messages: { from: string; to: string }, by: number) {
  emit('trade', 'group', t.from.teamId, kind, messages.from, by, { tradeId: t.id, status: t.status })
  emit('trade', 'group', t.to.teamId, kind, messages.to, by, { tradeId: t.id, status: t.status })
}

function announceCancelled(t: TradeView | null, reason: string, by: number) {
  if (!t) return
  const msg = `${teamName(t.from.teamId)} ↔ ${teamName(t.to.teamId)} 거래가 ${reason} 취소되었습니다`
  announceTrade(t, 'trade.closed', { from: msg, to: msg }, by)
}

// ---- 조회 ----

gameRouter.get('/game', (_req, res) => {
  res.json({ state: getGameState() })
})

/** 프레젠테이션 팀 현황. 시작 전에는 실제 팀 이름을 숨기므로 거부 (준비 상태는 state.lobby 의 A, B … 로) */
gameRouter.get('/game/roster', requireRole('presenter', 'admin'), (_req, res) => {
  if (isBeforeStart(getGameRow().status)) {
    res.status(409).json({ error: 'not_started' })
    return
  }
  res.json({ teams: getPublicRoster() })
})

/** 내 팀 게임 정보 (재화·리더 투표·라이프 제출·거래). 팀은 토큰이 아니라 DB 기준 */
gameRouter.get('/game/team', requireRole('member'), (req, res) => {
  const g = getGameRow()
  // 시작 전에는 게임 화면을 보지 못한다 ("게임 준비중 입니다.")
  if (isBeforeStart(g.status)) {
    res.status(409).json({ error: 'not_started' })
    return
  }
  const teamId = req.auth!.groupId
  if (!teamId) {
    res.status(404).json({ error: 'no_group' })
    return
  }
  const running = g.status === 'running'
  const body: TeamGameView = {
    resources: getTeamResources(teamId),
    election: running ? getElection(g.day, teamId, req.auth!.sub) : null,
    lifeSubmission: running ? getLifeSubmission(g.day, teamId) : null,
    trade: getActiveTradeForTeam(teamId),
    issue: getTeamIssue(teamId),
  }
  res.json(body)
})

function adminView(): AdminGameView {
  const g = getGameRow()
  const { amount: amounts, initial } = getAllResources()
  return {
    state: getGameState(),
    settings: getSettings(),
    teams: listGroups().map((t) => ({
      teamId: t.id,
      resources: amounts.get(t.id) ?? emptyResources(),
      initial: initial.get(t.id) ?? emptyResources(),
      activeMembers: activeMemberCount(t.id),
      election: g.status === 'running' ? getElection(g.day, t.id) : null,
      lifeSubmission: g.status === 'running' ? getLifeSubmission(g.day, t.id) : null,
    })),
    lifeReserve: g.life_reserve,
    aidUsed: g.aid_used === 1,
    trade: getActiveTrade(),
    ledger: listLedger(50),
    prep: getPrep(),
    issues: getAdminIssues(),
  }
}

gameRouter.get('/admin/game', requireRole('admin'), (_req, res) => {
  res.json(adminView())
})

// ---- 관리자: 설정 / 진행 ----

const settingsSchema = z.object({
  totalDays: z.number().int().min(1).max(30).nullable(),
  capacity: z.record(z.string().regex(/^\d+$/), z.number().int().min(0).max(50)),
  includeTest: z.boolean(),
  lifeReserve: amount,
  initial: z.record(z.string().regex(/^\d+$/), resourcesSchema),
  issueLimit: z.object({ gem: amount, gold: amount }).optional(),
})

gameRouter.put('/admin/game/settings', requireRole('admin'), handle(settingsSchema, (req, res, body) => {
  const ended = saveSettings(body)
  endSessions(ended)
  emit('game', 'all', null, 'game.updated', '게임 설정이 변경되었습니다', req.auth!.sub, { silent: true })
  signalLobby()
  res.json(adminView())
}))

/** 초기셋팅완료: 준비 상태로. 참가자가 로그인해 팀을 고를 수 있게 된다 */
gameRouter.post('/admin/game/prepare', requireRole('admin'), handle(null, (req, res) => {
  endSessions(prepareGame())
  emit('game', 'all', null, 'game.updated', '게임 준비 중입니다. 참가자는 로그인해 팀을 고르세요', req.auth!.sub, { silent: true })
  res.json(adminView())
}))

gameRouter.post('/admin/game/revert', requireRole('admin'), handle(null, (req, res) => {
  revertToSetup()
  emit('game', 'all', null, 'game.updated', '게임 설정 단계로 돌아갔습니다', req.auth!.sub, { silent: true })
  res.json(adminView())
}))

gameRouter.post('/admin/game/start', requireRole('admin'), handle(null, (req, res) => {
  const deactivated = startGame(req.auth!.sub)
  endSessions(deactivated)
  const g = getGameRow()
  emit('game', 'all', null, 'game.updated', `게임이 시작되었습니다 · 1일차 / 총 ${g.total_days}일 · 리더 선출 중`, req.auth!.sub, { day: 1, phase: 'leader' })
  res.json(adminView())
}))

const advanceSchema = z.object({ day: z.number().int().min(1), phase: z.enum(PHASES) })

gameRouter.post('/admin/game/next', requireRole('admin'), handle(advanceSchema, (req, res, body) => {
  const by = req.auth!.sub
  const leadersWereDone = body.phase === 'leader' && allElectionsDone(body.day)
  const r = advance(body)
  for (const f of r.finalized) announceElection(body.day, f.teamId, f.result, by)
  if (body.phase === 'leader' && !leadersWereDone && r.finalized.length > 0) announceAllLeaders(body.day, by)
  announceCancelled(r.cancelledTrade, '거래 활동 종료로', by)
  const message = r.day !== body.day
    ? `${r.day}일차가 시작되었습니다 · ${PHASE_LABELS[r.phase]} 중`
    : `${r.day}일차 · ${PHASE_LABELS[r.phase]} 중입니다`
  emit('game', 'all', null, 'game.updated', message, by, { day: r.day, phase: r.phase })
  // 모든 팀이 제출 불필요(팀원 1명 이하)면 라이프 제출 단계에 들어가자마자 완료
  if (r.phase === 'life' && allLivesDone(r.day)) emit('game', 'all', null, 'life.all_done', '모든 팀의 라이프가 제출되었습니다.', by, { day: r.day })
  res.json(adminView())
}))

gameRouter.post('/admin/game/end', requireRole('admin'), handle(null, (req, res) => {
  const cancelled = endGame()
  announceCancelled(cancelled.trade, '게임 종료로', req.auth!.sub)
  for (const r of cancelled.issues) {
    emit('game', 'group', r.teamId, 'issue.cancelled', `게임 종료로 ${issueText(r)} 발행 요청이 취소되었습니다`, req.auth!.sub, { issueId: r.id, muted: true })
  }
  emit('game', 'all', null, 'game.updated', '게임이 종료되었습니다. 곧 등수가 발표됩니다', req.auth!.sub)
  res.json(adminView())
}))

const scoreSchema = z.object({
  mode: z.enum(['gem', 'gold', 'ratio']),
  gem: z.number().int().min(0).max(1000),
  gold: z.number().int().min(0).max(1000),
}).refine((r) => r.mode !== 'ratio' || r.gem + r.gold > 0, { message: 'ratio_zero' })

gameRouter.post('/admin/game/results', requireRole('admin'), handle(scoreSchema, (req, res, body) => {
  const results = publishResults(body)
  const top = results.teams.filter((t) => t.rank === 1).map((t) => t.name).join(', ')
  emit('game', 'all', null, 'game.results', `최종 등수가 발표되었습니다 · 1위 ${top}`, req.auth!.sub)
  res.json(adminView())
}))

/**
 * 리셋: 참가자·진행자 계정 삭제, 기록·알림 전부 삭제 → 설정 단계. 리셋한 사람이 진행자면 본인 계정도 지워진다.
 * clearSettings: 게임 설정값(최대 인원·초기 재화·매장량)도 0 으로. 응답 reset 에 삭제 건수를 담아 화면에 보여준다
 */
gameRouter.post('/admin/game/reset', requireRole('admin'), handle(z.object({ clearSettings: z.boolean().optional() }), (req, res, body) => {
  const by = req.auth!.sub
  const { removed, ...summary } = resetGame(body.clearSettings ?? false)
  const self = removed.includes(by)
  // 남아 있는 화면(관리자·프레젠테이션)은 이 이벤트를 받고 피드를 비운다
  emit('game', 'all', null, 'game.reset', '게임이 초기화되었습니다', self ? null : by, { silent: true })
  res.json({ ...adminView(), removedSelf: self, reset: summary })
  disconnectUsers(removed)
}))

// ---- 관리자: 재화 조정 / 원조 / 동표 지정 / 거래 강제 취소 ----

const adjustSchema = z.object({
  teamId: z.number().int().positive(),
  deltas: deltaSchema,
  reason: z.enum(['production', 'correction']),
})

/** 생산(라이프는 매장량 안에서) / 정정. 게임 진행 중·종료 후 */
gameRouter.post('/admin/game/resources', requireRole('admin'), handle(adjustSchema, (req, res, body) => {
  const by = req.auth!.sub
  const g = getGameRow()
  if (isBeforeStart(g.status)) throw new GameError('not_running', '시작 전에는 게임 설정의 초기 재화를 수정하세요')
  if (!findGroupById(body.teamId)) throw new GameError('not_found', '', 404)
  const text = describeDeltas(body.deltas)
  if (!text) throw new GameError('no_change', '변경할 수량을 입력하세요', 400)
  db.transaction(() => {
    if (body.reason === 'production' && body.deltas.life) takeFromLifeReserve(body.deltas.life)
    applyDeltas(body.teamId, body.deltas, { reason: body.reason, day: g.day, by })
  })()
  const label = body.reason === 'production' ? '생산' : '정정'
  emit('game', 'group', body.teamId, 'resources.updated', `${label}: ${text}`, by)
  res.json(adminView())
}))

const aidSchema = z.object({
  fromTeamId: z.number().int().positive(),
  toTeamId: z.number().int().positive(),
  amounts: resourcesSchema,
})

/** 대가 없는 원조 (게임 전체 1회). 오프라인 협의 결과를 관리자가 입력 */
gameRouter.post('/admin/game/aid', requireRole('admin'), handle(aidSchema, (req, res, body) => {
  const by = req.auth!.sub
  const g = requireRunning()
  if (body.fromTeamId === body.toTeamId) throw new GameError('same_team', '', 400)
  if (!findGroupById(body.fromTeamId) || !findGroupById(body.toTeamId)) throw new GameError('not_found', '', 404)
  const text = describeDeltas(body.amounts)
  if (!text) throw new GameError('no_change', '원조할 수량을 입력하세요', 400)
  db.transaction(() => {
    markAidUsed()
    applyDeltas(body.fromTeamId, negate(body.amounts), { reason: 'aid', day: g.day, by })
    applyDeltas(body.toTeamId, body.amounts, { reason: 'aid', day: g.day, by })
  })()
  const msg = `원조: ${teamName(body.fromTeamId)} → ${teamName(body.toTeamId)} (${describeDeltas(body.amounts).replaceAll('+', '')})`
  emit('game', 'group', body.fromTeamId, 'resources.updated', msg, by)
  emit('game', 'group', body.toTeamId, 'resources.updated', msg, by)
  res.json(adminView())
}))

const tieSchema = z.object({ teamId: z.number().int().positive(), userId: z.number().int().positive() })

gameRouter.post('/admin/game/election', requireRole('admin'), handle(tieSchema, (req, res, body) => {
  const g = requireRunning()
  resolveTie(g.day, body.teamId, body.userId)
  announceElection(g.day, body.teamId, { status: 'done', leaderId: body.userId, votes: 0, changed: true }, req.auth!.sub)
  if (allElectionsDone(g.day)) announceAllLeaders(g.day, req.auth!.sub)
  res.json(adminView())
}))

gameRouter.post('/admin/game/trade/cancel', requireRole('admin'), handle(null, (req, res) => {
  announceCancelled(cancelActiveTrade(), '진행자에 의해', req.auth!.sub)
  res.json(adminView())
}))

// ---- 보석·골드 발행 ----

function issueText(r: IssueRequestView): string {
  return `${RESOURCE_LABELS[r.kind]} ${r.amount}개`
}

/**
 * 관리자 수락/거절. 알림은 모두 무음(muted).
 * - 보석: 화이트팀만 (다른 팀·프레젠테이션은 모른다)
 * - 골드: 수락하면 이번 발행 수량을 전체에 1회 공개, 거절은 옐로우팀만
 */
gameRouter.post('/admin/issue/:id/decide', requireRole('admin'), handle(z.object({ accept: z.boolean() }), (req, res, body) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) throw new GameError('not_found', '', 404)
  const r = decideIssue(id, body.accept, req.auth!.sub)
  const extra = { issueId: r.id, status: r.status, muted: true }
  if (!body.accept) {
    emit('game', 'group', r.teamId, 'issue.decided', `${issueText(r)} 발행 요청이 거절되었습니다`, req.auth!.sub, extra)
  } else if (r.kind === 'gold') {
    emit('game', 'all', null, 'issue.decided', `${josa(teamName(r.teamId), '이/가')} 골드 ${r.amount}개를 발행했습니다`, req.auth!.sub, extra)
  } else {
    emit('game', 'group', r.teamId, 'issue.decided', `${issueText(r)} 발행이 수락되었습니다 (보석 +${r.amount})`, req.auth!.sub, extra)
  }
  res.json(adminView())
}))

// ---- 참가자: 팀 선택 (준비 상태) ----

gameRouter.post('/game/join', requireRole('member'), handle(z.object({ teamId: z.number().int().positive() }), (req, res, body) => {
  const team = joinTeam(req.auth!.sub, body.teamId)
  moveUserRooms(req.auth!.sub, null, team.id)
  signalLobby()
  res.json({ user: findUserById(req.auth!.sub) })
}))

// ---- 참가자: 리더 투표 ----

function myTeam(req: Request): number {
  const teamId = req.auth!.groupId
  if (!teamId) throw new GameError('no_group', '', 404)
  return teamId
}

function requireLeader(req: Request): number {
  const teamId = myTeam(req)
  if (!req.auth!.isLeader) throw new GameError('not_leader', '리더만 할 수 있습니다', 403)
  return teamId
}

const voteSchema = z.object({ candidateId: z.number().int().positive() })

gameRouter.post('/game/vote', requireRole('member'), handle(voteSchema, (req, res, body) => {
  const g = requireRunning('leader')
  const teamId = myTeam(req)
  const by = req.auth!.sub
  const result = castVote(g.day, teamId, by, body.candidateId)
  emit('game', 'group', teamId, 'election.progress', `${userName(by)} 님이 투표했습니다`, by, { silent: true })
  if (result) {
    announceElection(g.day, teamId, result, by)
    if (result.status === 'done' && allElectionsDone(g.day)) announceAllLeaders(g.day, by)
  }
  res.json({ election: getElection(g.day, teamId, by), user: findUserById(by) })
}))

// ---- 참가자(리더): 라이프 제출 ----

const lifeSchema = z.object({ userIds: z.array(z.number().int().positive()).max(100) })

gameRouter.post('/game/life', requireRole('member'), handle(lifeSchema, (req, res, body) => {
  const g = requireRunning('life')
  const teamId = requireLeader(req)
  const by = req.auth!.sub
  const sub = submitLife(g.day, teamId, by, body.userIds)
  const dead = sub.eliminated.map(userName)
  const msg = `라이프 제출 완료: ${sub.saved.length}명 생존${dead.length ? ` · 탈락 ${dead.join(', ')}` : ''}`
  emit('game', 'group', teamId, 'life.submitted', msg, by, { day: g.day, eliminated: sub.eliminated })
  if (allLivesDone(g.day)) emit('game', 'all', null, 'life.all_done', '모든 팀의 라이프가 제출되었습니다.', by, { day: g.day })
  signalLobby() // 프레젠테이션 팀 현황(탈락 표시)
  // 응답을 먼저 보낸 뒤 세션을 끊는다 (리더 본인이 탈락한 경우에도 결과 화면을 받을 수 있게)
  res.json({ submission: sub })
  endSessions(sub.eliminated)
}))

// ---- 참가자(리더): 보석·골드 발행 요청 ----

/** 화이트(보석)·옐로우(골드) 리더. 되돌릴 수 없다. 팀 알림(관리자도 받음)은 무음, 관리자 화면은 요청 창을 띄운다 */
gameRouter.post('/issue/request', requireRole('member'), handle(z.object({ amount: z.number().int().min(1).max(100_000) }), (req, res, body) => {
  const teamId = requireLeader(req)
  const by = req.auth!.sub
  const r = requestIssue(teamId, body.amount, by)
  emit('game', 'group', teamId, 'issue.requested', `${userName(by)} 님이 ${issueText(r)} 발행을 요청했습니다`, by, { issueId: r.id, muted: true })
  res.json({ issue: getTeamIssue(teamId) })
}))

// ---- 참가자(리더): 거래 ----

const tradeIdOf = (req: Request) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) throw new GameError('not_found', '', 404)
  return id
}

gameRouter.post('/trade/request', requireRole('member'), handle(z.object({ toTeamId: z.number().int().positive() }), (req, res, body) => {
  const g = requireRunning('trade')
  const teamId = requireLeader(req)
  const by = req.auth!.sub
  const t = requestTrade(g.day, teamId, body.toTeamId, by)
  announceTrade(t, 'trade.requested', {
    from: `${teamName(t.to.teamId)}에 거래를 요청했습니다`,
    to: `${josa(teamName(t.from.teamId), '이/가')} 거래를 요청했습니다`,
  }, by)
  res.json({ trade: t })
}))

gameRouter.post('/trade/:id/respond', requireRole('member'), handle(z.object({ accept: z.boolean() }), (req, res, body) => {
  requireRunning('trade')
  const teamId = requireLeader(req)
  const t = respondTrade(tradeIdOf(req), teamId, body.accept)
  const msg = body.accept
    ? `${josa(teamName(t.to.teamId), '이/가')} 거래를 수락했습니다. 크레딧 1개를 먼저 제출한 팀이 거래를 시작합니다`
    : `${josa(teamName(t.to.teamId), '이/가')} 거래를 거부했습니다`
  announceTrade(t, body.accept ? 'trade.updated' : 'trade.closed', { from: msg, to: msg }, req.auth!.sub)
  res.json({ trade: t })
}))

gameRouter.post('/trade/:id/credit', requireRole('member'), handle(null, (req, res) => {
  const g = requireRunning('trade')
  const teamId = requireLeader(req)
  const t = payCredit(tradeIdOf(req), teamId, g.day, req.auth!.sub)
  const msg = `${josa(teamName(teamId), '이/가')} 크레딧 1개를 제출했습니다. 거래를 시작합니다`
  announceTrade(t, 'trade.updated', { from: msg, to: msg }, req.auth!.sub)
  emit('game', 'group', teamId, 'resources.updated', '거래 크레딧: 크레딧 -1', req.auth!.sub, { silent: true })
  res.json({ trade: t })
}))

gameRouter.post('/trade/:id/offer', requireRole('member'), handle(z.object({ offer: resourcesSchema }), (req, res, body) => {
  requireRunning('trade')
  const teamId = requireLeader(req)
  const t = proposeOffer(tradeIdOf(req), teamId, body.offer)
  const msg = `${josa(teamName(teamId), '이/가')} 제안했습니다: ${describeDeltas(body.offer).replaceAll('+', '') || '없음'}`
  announceTrade(t, 'trade.updated', { from: msg, to: msg }, req.auth!.sub)
  res.json({ trade: t })
}))

gameRouter.post('/trade/:id/accept', requireRole('member'), handle(null, (req, res) => {
  const g = requireRunning('trade')
  const teamId = requireLeader(req)
  const { trade: t, completed } = acceptOffer(tradeIdOf(req), teamId, g.day, req.auth!.sub)
  if (completed) {
    const give = (o: Resources | null) => describeDeltas(o ?? {}).replaceAll('+', '') || '없음'
    const msg = `거래 완료: ${teamName(t.from.teamId)} (${give(t.from.offer)}) ↔ ${teamName(t.to.teamId)} (${give(t.to.offer)})`
    announceTrade(t, 'trade.completed', { from: msg, to: msg }, req.auth!.sub)
  } else {
    const msg = `${josa(teamName(teamId), '이/가')} 제안을 수락했습니다`
    announceTrade(t, 'trade.updated', { from: msg, to: msg }, req.auth!.sub)
  }
  res.json({ trade: t, completed })
}))

gameRouter.post('/trade/:id/cancel', requireRole('member'), handle(null, (req, res) => {
  const teamId = requireLeader(req)
  const t = cancelTrade(tradeIdOf(req), teamId)
  announceCancelled(t, `${teamName(teamId)}에 의해`, req.auth!.sub)
  res.json({ trade: t })
}))
