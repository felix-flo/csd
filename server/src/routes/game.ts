/**
 * 게임 진행 API (docs/95.게임진행_설계.md). apiRouter 아래에 붙으므로 requireAuth 는 이미 적용돼 있다.
 * - 모든 역할: GET /game (일차·단계·초기 재화 합계·발표된 등수)
 * - 프레젠테이션·관리자: GET /game/roster 팀 현황 (팀원 명단·탈락, 시작 후에만)
 * - 프레젠테이션·관리자: GET /game/intro 오프닝 영상 유무 (data/media/intro.mp4 → /media/intro.mp4)
 * - 참가자  : GET /game/team, 라이프 제출(리더), 리더는 투표가 아니라 진행자가 지정한다 (docs/100 §7-6)
 * - 관리자  : /admin/game/* 설정·초기셋팅완료·설정으로 되돌리기·시작·다음 단계·종료(=최종장 시작)·리셋, 재화 조정, 원조, 리더 지정(/admin/game/leader),
 *             거래 제안(POST /admin/game/trade, docs/103 §10)·강제 취소
 * - 이주 (docs/100 N3): 참가자 POST /migration/request · /migration/:id/cancel, 받는 팀 리더 POST /migration/:id/decide, 관리자 POST /admin/migration/:id/cancel
 * - 테러리스트 (docs/100 N4): 참가자 GET·POST /game/fate (준비 상태 운명의 카드), 관리자 PUT /admin/spies (후보 중 지정)
 * - 최종장 (docs/100 N2): /admin/final/close · tiebreak · next · recompute, 참가자 POST /final/vote
 * - 참가자(준비 상태): POST /game/join 팀 선택. 시작 전에는 팀 게임 정보를 주지 않는다
 * - 보석·골드 발행 (docs/97): 화이트·골드 리더 POST /issue/request → 즉시 발행 (docs/103 §9)
 * - 전쟁 (docs/99, docs/103 §4·§12): 리더 POST /war/declare → 즉시 시작, 관리자 POST /admin/war/cost (다음 날 비용) · /admin/war/allow (다음 라운드 허용/제재) · /admin/war/sanction-off (전쟁 제재 금지 on/off) · /admin/war/:id/resolve
 * 상태 변화는 events 에 기록 후 Socket.IO 로 알린다. 클라이언트는 game/trade 이벤트를 받으면 상태를 다시 조회한다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { requireRole } from '../auth/middleware.js'
import { findGroupById, findUserById, listGroups } from '../db/users.js'
import { INTRO_FILE, isBeforeStart, OPENING_STEPS, type IntroResponse } from '../../../shared/game.js'
import { GameError } from '../db/gameError.js'
import {
  activeMemberCount, advance, endGame, getGameRow, getGameState, getPrep, getPublicRoster, getSettings, joinTeam, prepareGame, setTabLogin,
  requireRunning, resetGame, revertToSetup, saveSettings, startGame,
  moveOpening,
} from '../db/game.js'
import { applyDeltas, describeDeltas, getAllResources, getTeamResources, listLedger } from '../db/resources.js'
import { allElectionsDone, designateLeader, finalizeElection, getElection, type FinalizeResult } from '../db/election.js'
import {
  cancelMigration, decideMigration, getAdminMigrations, getTeamMigrationView, requestMigration, sweepMigrations, teamLeaderId,
} from '../db/migration.js'
import { chooseFate, getAdminSpyView, getMyFate, getMySpy, setSpies } from '../db/spy.js'
import { allLivesDone, getLifeSubmission, revealLifeResults, submitLife } from '../db/life.js'
import { executeTrade } from '../db/trades.js'
import { getAdminIssues, getTeamIssue, issueTeamId, requestIssue } from '../db/issuance.js'
import {
  advanceFinal, castFinalVote, closeFinalVotes, finalVoteProgress, getMyFinalVote, hasLifeGrant, recomputeResults, setLifeVote, setTiebreak,
} from '../db/final.js'
import { listAids, recordAid } from '../db/council.js'
import { declareWar, describeCost, getWarCost, getWarOfDay, getWarRule, isWarAllowed, isWarSanctionOff, resolveWar, setWarCost, setWarRule, setWarSanctionOff } from '../db/war.js'
import { db } from '../db/index.js'
import { schedulePhaseTimer } from '../phaseTimer.js'
import { insertEvent } from '../db/events.js'
import { disconnectUsers, moveUserRooms, publishEvent, signalLobby } from '../realtime/index.js'
import { revokeUserRefreshTokens } from '../auth/tokens.js'
import { emptyResources, FINAL_STEPS, josa, LAST_ROUND_PHASES, MIGRATION_CANCEL_LABELS, PHASE_LABELS, phaseLabel, PRODUCTION_BASE_PLAYS, PRODUCTION_MAX_EXTRA, PRODUCTION_RATES, productionResult, RESOURCE_KINDS, RESOURCE_LABELS, shareText, warWinner } from '../../../shared/game.js'
import type { AdminGameView, GameResults, IssueRequestView, LifeSubmissionView, MigrationView, Phase, Resources, SpyStatus, TeamGameView, TradeView } from '../../../shared/game.js'
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
function endSessions(ids: number[], reason?: 'eliminated') {
  if (ids.length === 0) return
  revokeUserRefreshTokens(ids)
  disconnectUsers(ids, reason)
}

/**
 * 참가자의 행동으로 생긴 결과 알림(리더 선출 결과, 모든 팀 완료, 거래 완료 등)에 붙인다.
 * 화면은 "내가 만든 알림은 팝업하지 않는다" 규칙을 쓰는데, 결과 알림은 마지막으로 행동한 사람에게도 팝업·소리가 가야 한다.
 * 관리자 행동(단계 넘기기·동표 지정)으로 생긴 결과는 붙이지 않는다 (관리자 화면에 팀별 팝업이 쏟아지지 않게)
 */
const NOTIFY_SELF = { notifySelf: true } as const

function announceElection(day: number, teamId: number, r: FinalizeResult, by: number, extra: Record<string, unknown> = {}) {
  const who = r.leaderId != null ? `${userName(r.leaderId)} 님` : '없음'
  const message = r.how === 'auto'
    ? `팀원이 1명이라 ${who}이 리더입니다`
    : r.changed ? `새 리더는 ${who}입니다` : `리더 ${who}이 재신임되었습니다`
  emit('game', 'group', teamId, 'election.done', message, by, { day, leaderId: r.leaderId, ...extra })
  // 팀 알림을 받지 않는 프레젠테이션의 팀 현황(리더 표시) 갱신
  signalLobby()
}

function announceAllLeaders(day: number, by: number, extra: Record<string, unknown> = {}) {
  emit('game', 'all', null, 'election.all_done', '모든팀의 리더 선출이 완료되었습니다.', by, { day, ...extra })
}

/** 거래 당사자 두 팀에 각각 알린다. 관리자는 두 팀 알림을 모두 받으므로 두 번째(받는 팀) 것은 adminSkip 으로 뺀다 (한 번만 뜨게) */
function announceTrade(t: TradeView, kind: string, messages: { from: string; to: string }, by: number, extra: Record<string, unknown> = {}) {
  emit('trade', 'group', t.from.teamId, kind, messages.from, by, { tradeId: t.id, ...extra })
  emit('trade', 'group', t.to.teamId, kind, messages.to, by, { tradeId: t.id, adminSkip: true, ...extra })
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
/** 오프닝 영상: data/media/intro.mp4 가 있으면 그 URL. 게임 시작 순간 프레젠테이션이 전체 화면으로 튼다 */
gameRouter.get('/game/intro', requireRole('presenter', 'admin'), (_req, res) => {
  const file = path.join(config.mediaDir, INTRO_FILE)
  let size = 0
  try { size = fs.statSync(file).size } catch { /* 없음 */ }
  res.json({ url: size > 0 ? `/media/${INTRO_FILE}` : null, size } satisfies IntroResponse)
})

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
    election: running ? getElection(g.day, teamId) : null,
    lifeSubmission: running ? hiddenUntilReveal(getLifeSubmission(g.day, teamId)) : null,
    issue: getTeamIssue(teamId),
    myFinalVote: g.status === 'final' || g.status === 'ended' ? getMyFinalVote(req.auth!.sub) : null,
    migration: running ? getTeamMigrationView(req.auth!.sub, teamId, !!req.auth!.isLeader) : null,
    warResult: running ? teamWarResult(g.day, teamId) : null,
    lifeGrant: hasLifeGrant(req.auth!.sub),
    // 테러리스트 본인에게만 (시작 알림은 기록하지 않고, 화면이 이 값을 보고 무음 팝업을 1번 띄운다)
    spy: getMySpy(req.auth!.sub),
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
    aidsToday: g.status === 'running' ? listAids(g.day) : [],
    ledger: listLedger(50),
    prep: getPrep(),
    issues: getAdminIssues(),
    war: {
      today: g.status === 'running' ? getWarOfDay(g.day) : null,
      todayCost: g.status === 'running' ? getWarCost(g.day) : null,
      nextCost: g.status === 'running' ? getWarCost(g.day + 1) : null,
      todayAllowed: g.status === 'running' ? isWarAllowed(g.day) : true,
      nextAllowed: g.status === 'running' ? getWarRule(g.day + 1) : null,
      sanctionOff: isWarSanctionOff(),
    },
    finalVotes: g.status === 'final' || g.status === 'ended' ? finalVoteProgress() : [],
    migrations: getAdminMigrations(),
    spy: getAdminSpyView(),
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
  initial: z.record(z.string().regex(/^\d+$/), resourcesSchema),
  issueLimit: z.object({ gem: amount, gold: amount }).optional(),
  warCost: z.object({ gem: amount, gold: amount, credit: amount }).optional(),
  migrationStartDay: z.number().int().min(1).max(30).optional(),
})

gameRouter.put('/admin/game/settings', requireRole('admin'), handle(settingsSchema, (req, res, body) => {
  const ended = saveSettings(body)
  endSessions(ended)
  emit('game', 'all', null, 'game.updated', '게임 설정이 변경되었습니다', req.auth!.sub, { silent: true })
  signalLobby()
  res.json(adminView())
}))

/** 테스트 모드(탭 로그인, docs/101) 전환. 상태와 무관. 참가자에게 알리지 않는다 */
gameRouter.put('/admin/game/tab-login', requireRole('admin'), handle(z.object({ on: z.boolean() }), (_req, res, body) => {
  setTabLogin(body.on)
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
  schedulePhaseTimer()
  emit('game', 'all', null, 'game.updated', '게임 설정 단계로 돌아갔습니다', req.auth!.sub, { silent: true })
  res.json(adminView())
}))

gameRouter.post('/admin/game/start', requireRole('admin'), handle(null, (req, res) => {
  const deactivated = startGame(req.auth!.sub)
  endSessions(deactivated)
  emit('game', 'all', null, 'game.updated', '게임이 시작되었습니다', req.auth!.sub, { silent: true })
  res.json(adminView())
}))

/** 오프닝 넘기기. 마지막 장 다음은 1라운드 시작 */
gameRouter.post('/admin/game/opening', requireRole('admin'), handle(z.object({ step: z.enum(OPENING_STEPS), dir: z.union([z.literal(1), z.literal(-1)]) }), (req, res, body) => {
  const started = moveOpening(body.step, body.dir)
  const by = req.auth!.sub
  if (started) {
    schedulePhaseTimer()
    const g = getGameRow()
    emit('game', 'all', null, 'game.updated', `1라운드가 시작되었습니다 · 총 ${g.total_days}라운드 · 리더 선출 중 · ${todayCostText(1)}${migrationOpensText(1)}`, by, { day: 1, phase: 'leader' })
  } else {
    emit('game', 'all', null, 'game.updated', '오프닝', by, { silent: true })
  }
  res.json(adminView())
}))

const advanceSchema = z.object({ day: z.number().int().min(1), phase: z.enum(LAST_ROUND_PHASES) })

/** 단계·일차 전환 + 알림. quiet 면 단계 공지 없이 화면만 바뀐다 (전쟁 뒤 리더 협의는 전쟁 종료 화면이 공지를 대신한다) */
function advanceAndAnnounce(expect: { day: number; phase: Phase }, by: number, quiet = false) {
  const r = advance(expect)
  schedulePhaseTimer()
  announceMigrationSweep(by)
  // 날이 바뀔 때마다 오늘 전쟁 선포 비용·허용 여부를 전체에 알린다 (바뀌지 않아도. docs/100 D6-b). 단계만 바뀔 때는 붙이지 않는다
  const message = r.day !== expect.day
    ? `${r.day}라운드가 시작되었습니다 · ${phaseLabel(r.phase, r.day)} 중 · ${todayCostText(r.day)}${migrationOpensText(r.day)}${lastRoundText(r.day)}`
    : `${r.day}라운드 · ${phaseLabel(r.phase, r.day)} 중입니다`
  emit('game', 'all', null, 'game.updated', message, by, { day: r.day, phase: r.phase, ...(quiet && { silent: true }) })
  // 단계 알림 다음에 보낸다: 화면은 단계 알림을 받으면 떠 있던 공지를 지운다
  if (expect.phase === 'life') endSessions(announceLifeResults(expect.day, by), 'eliminated')
  // 룰이 바뀌는 라운드: 프레젠테이션에 전체 공지 (휴대폰은 위 알림에 같은 내용이 있다)
  if (r.day !== expect.day && migrationOpensText(r.day)) {
    presenterNotice('migration.opened', '이번 라운드부터 이주가 가능합니다.\n각자의 휴대폰 화면에서 이주 관련 내용을 확인해주세요.', by, r.day)
  }
  if (r.day !== expect.day && lastRoundText(r.day)) {
    presenterNotice('round.last', '이번 라운드는 마지막 라운드입니다.\n화이트와 골드는 마지막 발행 단계에서만 발행할 수 있습니다.\n이번 발행량은 최종장 결과 때 공개됩니다.', by, r.day)
  }
  // 모든 팀이 제출 불필요(팀원 없음 · 1명+라이프 0)면 라이프 제출 단계에 들어가자마자 완료
  if (r.phase === 'life' && allLivesDone(r.day)) emit('game', 'all', null, 'life.all_done', '모든 팀의 라이프가 제출되었습니다.', by, { day: r.day })
  return r
}

gameRouter.post('/admin/game/next', requireRole('admin'), handle(advanceSchema, (req, res, body) => {
  advanceAndAnnounce(body, req.auth!.sub, body.phase === 'trade' && !!getWarOfDay(body.day))
  res.json(adminView())
}))

gameRouter.post('/admin/game/end', requireRole('admin'), handle(null, (req, res) => {
  const cancelled = endGame()
  schedulePhaseTimer()
  for (const r of cancelled.issues) {
    emit('game', 'group', r.teamId, 'issue.cancelled', `게임 종료로 ${issueText(r)} 발행 요청이 취소되었습니다`, req.auth!.sub, { issueId: r.id, muted: true })
  }
  const extra = getGameRow().life_vote_passed !== 0
    ? '1인 1표 + 남은 라이프 수만큼 무작위로 뽑힌 사람은 2표'
    : '1인 1표'
  emit('game', 'all', null, 'final.started', `최종장이 시작되었습니다 · 최종 투표: 보석과 골드 중 하나에 투표하세요 (${extra})`, req.auth!.sub)
  for (const id of cancelled.lifeGrants) emit('game', 'user', id, 'final.life_grant', '라이프 투표권에 뽑혔습니다. 내 표는 2표로 계산됩니다', req.auth!.sub)
  res.json(adminView())
}))

// ---- 테러리스트 (docs/100 N4) ----

/** 내 운명의 카드 (준비 상태 대기 화면) */
gameRouter.get('/game/fate', requireRole('member'), (req, res) => {
  res.json({ fate: getMyFate(req.auth!.sub) })
})

/** 운명의 카드 선택 (1회). 알림 없음 — 관리자 현황만 기록 없는 신호로 갱신 */
gameRouter.post('/game/fate', requireRole('member'), handle(z.object({ fate: z.enum(['sun', 'moon']) }), (req, res, body) => {
  chooseFate(req.auth!.sub, body.fate)
  signalLobby()
  res.json({ fate: body.fate })
}))

/** 관리자: 악마를 고른 후보 중에서 테러리스트 지정 (준비 상태). 참가자에게 알리지 않는다 */
gameRouter.put('/admin/spies', requireRole('admin'), handle(z.object({ userIds: z.array(z.number().int().positive()).max(200) }), (_req, res, body) => {
  setSpies(body.userIds)
  res.json(adminView())
}))

function spyRevealText(spies: SpyStatus[]): string {
  if (!spies.length) return '테러리스트는 없었습니다'
  const reward = (x: SpyStatus) => (x.alive ? `${x.reward.toLocaleString('ko-KR')}원` : '탈락으로 0원')
  // 룰 04: "테러리스트는 [이름]님이었어요. 테러리스트 보상: [금액]"
  if (spies.length === 1) return `테러리스트는 ${spies[0]!.name}님(${teamName(spies[0]!.teamId)})이었습니다 · 테러리스트 보상: ${reward(spies[0]!)}`
  return `테러리스트는 ${spies.length}명이었습니다 · ${spies.map((x) => `${x.name}님(${teamName(x.teamId)}) ${reward(x)}`).join(' / ')}`
}

// ---- 이주 (docs/100 N3) ----

/** 이주가 열리는 라운드 시작 공지에 붙인다 */
function migrationOpensText(day: number): string {
  const g = getGameRow()
  return day === g.migration_start_day && day <= (g.total_days ?? 0) ? ' · 이주가 열렸습니다 (라이프 제출 전까지 신청)' : ''
}

function lastRoundText(day: number): string {
  return day === getGameRow().total_days ? ' · 마지막 라운드입니다 (화이트·골드는 마지막 발행 단계에서만 발행)' : ''
}

/** 프레젠테이션 전체 공지. 휴대폰에는 보내지 않는다 */
function presenterNotice(kind: string, message: string, by: number, day: number) {
  publishEvent(insertEvent({ type: 'game', scope: 'role', targetRole: 'presenter', createdBy: by, payload: { kind, message, day } }))
}

function migrationText(m: MigrationView): string {
  return `${teamName(m.fromTeamId)} → ${teamName(m.toTeamId)}`
}

/** 취소 알림: 신청자에게만 (받는 팀 리더·관리자 화면은 기록 없는 신호로 갱신) */
function announceMigrationCancelled(list: MigrationView[], by: number | null) {
  for (const m of list) {
    const why = m.cancelReason ? MIGRATION_CANCEL_LABELS[m.cancelReason] : '취소'
    emit('game', 'user', m.userId, 'migration.cancelled', `이주 신청이 취소되었습니다 (${migrationText(m)} · ${why})`, by, { migrationId: m.id, silent: m.cancelReason === 'self' })
  }
  if (list.length) signalLobby()
}

/** 리더가 바뀌거나 탈락·팀 이동이 생긴 뒤: 자동 취소 대상 정리 + 알림 (api.ts 도 쓴다) */
export function announceMigrationSweep(by: number | null) {
  announceMigrationCancelled(sweepMigrations(), by)
}

/** 일반 팀원 신청. 받는 팀 리더에게만 알림 (관리자는 무음) */
gameRouter.post('/migration/request', requireRole('member'), handle(z.object({ toTeamId: z.number().int().positive() }), (req, res, body) => {
  const by = req.auth!.sub
  const m = requestMigration(by, body.toTeamId)
  const leader = teamLeaderId(m.toTeamId)
  if (leader != null) emit('game', 'user', leader, 'migration.requested', `${userName(by)} 님(${teamName(m.fromTeamId)})이 우리 팀으로 이주를 신청했습니다`, by, { migrationId: m.id })
  publishEvent(insertEvent({
    type: 'game', scope: 'role', targetRole: 'admin', createdBy: by,
    payload: { kind: 'migration.requested', message: `이주 신청: ${m.userName} (${migrationText(m)})`, migrationId: m.id, muted: true },
  }))
  res.json({ migration: m })
}))

gameRouter.post('/migration/:id/cancel', requireRole('member'), handle(null, (req, res) => {
  const m = cancelMigration(Number(req.params.id), 'self', req.auth!.sub)
  announceMigrationCancelled([m], req.auth!.sub)
  res.json({ migration: m })
}))

/** 받는 팀 리더 수락/거절. 수락: 즉시 소속 변경 + 전체 공지 (룰 04 이주 알림) */
gameRouter.post('/migration/:id/decide', requireRole('member'), handle(z.object({ accept: z.boolean() }), (req, res, body) => {
  const by = req.auth!.sub
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) throw new GameError('not_found', '', 404)
  // 신청자가 리더가 되었거나 탈락한 신청은 먼저 자동 취소로 정리한다
  announceMigrationSweep(by)
  const { migration: m, electionTeam } = decideMigration(id, by, body.accept)
  if (!body.accept) {
    emit('game', 'user', m.userId, 'migration.rejected', `${teamName(m.toTeamId)} 리더가 이주 신청을 거절했습니다`, by, { migrationId: m.id })
    res.json({ migration: m })
    return
  }
  moveUserRooms(m.userId, m.fromTeamId, m.toTeamId)
  // 두 팀 팀원 목록·본인 팀 정보 갱신 (관리자 팀 이동과 같은 시스템 알림. 화면은 이걸로 /api/me 를 다시 받는다)
  const payload = {
    kind: 'member.moved', userId: m.userId, userName: m.userName,
    fromTeamId: m.fromTeamId, fromTeamName: teamName(m.fromTeamId), toTeamId: m.toTeamId, toTeamName: teamName(m.toTeamId),
    message: `${m.userName} 님이 이주했습니다 (${migrationText(m)})`, silent: true,
  }
  for (const teamId of [m.fromTeamId, m.toTeamId]) {
    publishEvent(insertEvent({ type: 'system', scope: 'group', targetId: teamId, payload, createdBy: by }))
  }
  emit('game', 'all', null, 'migration.accepted', `${m.userName}님이 ${teamName(m.fromTeamId)}에서 ${teamName(m.toTeamId)}으로 이주했습니다`, by, { migrationId: m.id, ...NOTIFY_SELF })
  // 리더 선출 중이었으면 원래 팀 재집계 (남은 팀원이 모두 투표했으면 바로 결과)
  if (electionTeam != null) {
    const g = getGameRow()
    const r = finalizeElection(g.day, electionTeam)
    if (r) {
      announceElection(g.day, electionTeam, r, by)
      if (r.status === 'done' && allElectionsDone(g.day)) announceAllLeaders(g.day, by)
    }
  }
  signalLobby()
  res.json({ migration: m })
}))

gameRouter.post('/admin/migration/:id/cancel', requireRole('admin'), handle(null, (req, res) => {
  const m = cancelMigration(Number(req.params.id), 'admin', req.auth!.sub)
  announceMigrationCancelled([m], req.auth!.sub)
  res.json(adminView())
}))

// ---- 최종장 (docs/100 N2 + D7) ----

/** 최종 투표 (활성 참가자). 득표는 공개하지 않고 인원 현황만 갱신 (기록 없는 신호) */
/** 마지막 라운드 리더 협의 필수 안건 "라이프 투표권": 기본 반영. 리더 3명이 반대하면 관리자가 미반영으로 입력 (리더끼리 앱 표결은 없다) */
gameRouter.post('/admin/game/life-vote', requireRole('admin'), handle(z.object({ passed: z.boolean() }), (req, res, body) => {
  setLifeVote(body.passed)
  const msg = body.passed
    ? '라이프 투표권을 반영합니다: 최종 투표 때 팀마다 남은 라이프 수만큼 무작위로 뽑힌 사람이 1표를 더 갖습니다'
    : '리더 3명이 반대해 라이프 투표권을 반영하지 않습니다: 최종 투표는 1인 1표입니다'
  emit('game', 'all', null, 'final.life_vote', msg, req.auth!.sub)
  res.json(adminView())
}))

gameRouter.post('/final/vote', requireRole('member'), handle(z.object({ choice: z.enum(['gem', 'gold']) }), (req, res, body) => {
  const by = req.auth!.sub
  const { weight } = castFinalVote(by, body.choice)
  const votes = `${weight}표${weight > 1 ? ' · 라이프 투표권 사용' : ''}`
  emit('game', 'user', by, 'final.voted', `최종 투표 완료: ${RESOURCE_LABELS[body.choice]} (${votes})`, by, { silent: true })
  signalLobby()
  res.json({ vote: getMyFinalVote(by) })
}))

/** 투표 마감 → 득표 전체 공개. 동점이면 가위바위보 안내 */
gameRouter.post('/admin/final/close', requireRole('admin'), handle(null, (req, res) => {
  const t = closeFinalVotes()
  const tie = t.tie ? ' — 동점입니다. 화이트·골드 리더 가위바위보로 정합니다' : ''
  emit('game', 'all', null, 'final.closed', `투표 마감: 보석 ${t.gem}표 · 골드 ${t.gold}표${tie}`, req.auth!.sub)
  res.json(adminView())
}))

gameRouter.post('/admin/final/tiebreak', requireRole('admin'), handle(z.object({ winner: z.enum(['white', 'yellow']) }), (req, res, body) => {
  const adopted = setTiebreak(body.winner)
  const winner = teamName(issueTeamId(adopted))
  emit('game', 'all', null, 'final.tiebreak', `가위바위보: ${josa(winner, '이/가')} 이겼습니다 → ${RESOURCE_LABELS[adopted]}`, req.auth!.sub)
  res.json(adminView())
}))

function resultsText(r: GameResults): string {
  return r.teams.map((t) => `${t.name} ${t.excluded ? '보상 없음' : shareText(t.share)}`).join(' · ')
}

/** 다음 단계: 투표 → 결과 발표(채택 화폐 + 마지막 라운드 발행량 공개) → 정산 → 끝 */
gameRouter.post('/admin/final/next', requireRole('admin'), handle(z.object({ step: z.enum(FINAL_STEPS) }), (req, res, body) => {
  const by = req.auth!.sub
  const r = advanceFinal(body.step)
  if (r.to === 'result') {
    const rps = r.tiebreak ? ` · 가위바위보 ${teamName(issueTeamId(r.adopted))} 승` : ''
    const issued = `마지막 라운드 발행: ${teamName(issueTeamId('gem'))} 보석 ${r.lastIssue.gem}개 · ${teamName(issueTeamId('gold'))} 골드 ${r.lastIssue.gold}개`
    emit('game', 'all', null, 'final.result', `상금 화폐는 ${RESOURCE_LABELS[r.adopted]}입니다 (보석 ${r.tally.gem}표 · 골드 ${r.tally.gold}표${rps}) · ${issued}`, by)
  } else if (r.to === 'settle') {
    emit('game', 'all', null, 'final.settled', `정산: ${resultsText(r.results)}`, by)
  } else if (r.to === 'spy') {
    emit('game', 'all', null, 'final.spy', spyRevealText(r.spies), by)
  } else {
    emit('game', 'all', null, 'final.ended', '게임이 끝났습니다. 수고하셨습니다', by)
  }
  res.json(adminView())
}))

/** 정산 다시 계산 (정산 단계에서 재화를 정정한 경우) */
gameRouter.post('/admin/final/recompute', requireRole('admin'), handle(null, (req, res) => {
  const r = recomputeResults()
  emit('game', 'all', null, 'final.settled', `정산 (다시 계산): ${resultsText(r)}`, req.auth!.sub)
  res.json(adminView())
}))

/**
 * 리셋: 참가자·진행자 계정 삭제, 기록·알림 전부 삭제 → 설정 단계. 리셋한 사람이 진행자면 본인 계정도 지워진다.
 * clearSettings: 게임 설정값을 기본값(shared DEFAULT_TEAM_SETUP 등)으로 되돌린다. 응답 reset 에 삭제 건수를 담아 화면에 보여준다
 */
gameRouter.post('/admin/game/reset', requireRole('admin'), handle(z.object({ clearSettings: z.boolean().optional() }), (req, res, body) => {
  const by = req.auth!.sub
  const { removed, ...summary } = resetGame(body.clearSettings ?? false)
  schedulePhaseTimer()
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

/** 생산 / 정정. 게임 진행 중·종료 후. 라이프 매장량 제한 없음 (docs/103 §3) */
gameRouter.post('/admin/game/resources', requireRole('admin'), handle(adjustSchema, (req, res, body) => {
  const by = req.auth!.sub
  const g = getGameRow()
  if (isBeforeStart(g.status)) throw new GameError('not_running', '시작 전에는 게임 설정의 초기 재화를 수정하세요')
  if (!findGroupById(body.teamId)) throw new GameError('not_found', '', 404)
  const text = describeDeltas(body.deltas)
  if (!text) throw new GameError('no_change', '변경할 수량을 입력하세요', 400)
  applyDeltas(body.teamId, body.deltas, { reason: body.reason, day: g.day, by })
  const label = body.reason === 'production' ? '생산' : '정정'
  emit('game', 'group', body.teamId, 'resources.updated', `${label}: ${text}`, by)
  res.json(adminView())
}))

const productionSchema = z.object({
  teamId: z.number().int().positive(),
  mode: z.enum(['life', 'credit']),
  extra: z.number().int().min(0).max(PRODUCTION_MAX_EXTRA),
  wins: z.number().int().min(0),
})

/** 생산게임 결과: 팀 · 선택(라이프/크레딧) · 재도전 판수 · 이긴 횟수 → 팀별 보상 규칙으로 계산해 크레딧 차감과 보상을 한 번에 반영. 라운드마다 팀당 1번 */
gameRouter.post('/admin/game/production', requireRole('admin'), handle(productionSchema, (req, res, body) => {
  const by = req.auth!.sub
  const g = requireRunning('production')
  const team = findGroupById(body.teamId)
  if (!team) throw new GameError('not_found', '', 404)
  const result = productionResult(team.code, body.mode, body.extra, body.wins)
  if (!result) {
    if (!PRODUCTION_RATES[team.code]) throw new GameError('no_rate', `${team.name}의 생산게임 보상 규칙이 없습니다. 정정으로 입력하세요`)
    throw new GameError('too_many_wins', `이긴 횟수가 판수(${PRODUCTION_BASE_PLAYS + body.extra}판)보다 많습니다`, 400)
  }
  const done = db.prepare(`SELECT 1 FROM resource_ledger WHERE group_id = ? AND day = ? AND reason = 'production' LIMIT 1`).get(team.id, g.day)
  if (done) throw new GameError('already_done', `${team.name}의 이번 라운드 생산은 이미 입력했습니다. 고치려면 정정으로 입력하세요`)
  const credit = getTeamResources(team.id).credit
  if (credit < result.cost) throw new GameError('insufficient', `크레딧 부족: 참가비 1${body.extra ? ` + 재도전 ${body.extra}` : ''} = ${result.cost}개 필요, 보유 ${credit}개`)
  applyDeltas(team.id, result.deltas, { reason: 'production', day: g.day, by })
  const label = RESOURCE_LABELS[body.mode]
  emit('game', 'group', team.id, 'resources.updated',
    `생산게임: ${label} 선택 · ${result.plays}판 ${body.wins}승 → ${label} +${result.reward} (크레딧 −${result.cost})`, by)
  res.json(adminView())
}))

const aidSchema = z.object({
  fromTeamId: z.number().int().positive(),
  toTeamId: z.number().int().positive(),
  amounts: resourcesSchema,
})

/** 대가 없는 원조. 리더 협의 단계에서 오프라인 협의 결과(리더 4명 중 3명 찬성)를 관리자가 입력. 라운드마다 전체 1번 (docs/103 §11) */
gameRouter.post('/admin/game/aid', requireRole('admin'), handle(aidSchema, (req, res, body) => {
  const by = req.auth!.sub
  const g = requireRunning()
  if (g.phase !== 'council') throw new GameError('wrong_phase', '원조는 리더 협의 단계에서만 입력할 수 있습니다')
  if (body.fromTeamId === body.toTeamId) throw new GameError('same_team', '', 400)
  if (!findGroupById(body.fromTeamId) || !findGroupById(body.toTeamId)) throw new GameError('not_found', '', 404)
  const text = describeDeltas(body.amounts)
  if (!text) throw new GameError('no_change', '원조할 수량을 입력하세요', 400)
  recordAid(g.day, body.fromTeamId, body.toTeamId, body.amounts, by)
  const msg = `원조: ${teamName(body.fromTeamId)} → ${teamName(body.toTeamId)} (${describeDeltas(body.amounts).replaceAll('+', '')})`
  emit('game', 'group', body.fromTeamId, 'resources.updated', msg, by)
  emit('game', 'group', body.toTeamId, 'resources.updated', msg, by)
  res.json(adminView())
}))

const leaderSchema = z.object({ teamId: z.number().int().positive(), userId: z.number().int().positive() })

/** 리더 지정 (진행자 수동, docs/100 §7-6). 리더 선출 단계에서는 그 팀의 이번 라운드 선정을 완료로 표시한다. 다른 단계에서도 교체용으로 쓸 수 있다 */
gameRouter.post('/admin/game/leader', requireRole('admin'), handle(leaderSchema, (req, res, body) => {
  const g = requireRunning()
  const by = req.auth!.sub
  const wereDone = allElectionsDone(g.day)
  const r = designateLeader(g.day, body.teamId, body.userId)
  announceElection(g.day, body.teamId, r, by)
  if (!wereDone && allElectionsDone(g.day)) announceAllLeaders(g.day, by)
  // 새 리더의 대기 중 이주 신청은 자동 취소
  announceMigrationSweep(by)
  res.json(adminView())
}))

// ---- 보석·골드 발행 ----

/** 날 시작 알림에 붙이는 오늘 선포 비용·허용 여부 (docs/100 D6-b, docs/103 §12) */
function todayCostText(day: number): string {
  if (!isWarAllowed(day)) return '이번 라운드는 전쟁 금지 (리더 협의)'
  const c = getWarCost(day)
  const text = c ? describeCost(c) : '미정'
  return `이번 라운드 전쟁 선포 비용: ${text === '없음' ? '없음 (무료)' : text}`
}

function issueText(r: IssueRequestView): string {
  return `${RESOURCE_LABELS[r.kind]} ${r.amount}개`
}

// ---- 전쟁 ----

const warCostSchema = z.object({ gem: amount, gold: amount, credit: amount })

/** 다음 날 선포 비용. 이걸 정해야 "다음 날로" 넘어갈 수 있다 (마지막 날에는 다음 날이 없다) */
gameRouter.post('/admin/war/cost', requireRole('admin'), handle(warCostSchema, (req, res, body) => {
  const g = requireRunning()
  if (g.day >= (g.total_days ?? 0)) throw new GameError('last_day', '마지막 라운드에는 다음 라운드 비용이 필요 없습니다')
  setWarCost(g.day + 1, body)
  // 다른 진행자 화면 갱신용 (진행자만)
  publishEvent(insertEvent({
    type: 'game', scope: 'role', targetRole: 'admin', createdBy: req.auth!.sub,
    payload: { kind: 'game.updated', message: `${g.day + 1}라운드 전쟁 선포 비용: ${describeCost(body)}`, silent: true },
  }))
  res.json(adminView())
}))

/** 다음 라운드 전쟁 허용/제재 (리더 협의 결과, docs/103 §12). 리더 협의 단계에서 입력. 입력이 없으면 허용.
 * 리더 3명 이상이 제재에 찬성하면(오프라인) 금지를 건다. 전쟁 제재 금지가 켜져 있으면 입력할 수 없다 */
gameRouter.post('/admin/war/allow', requireRole('admin'), handle(z.object({ allowed: z.boolean() }), (req, res, body) => {
  const g = requireRunning()
  if (g.phase !== 'council') throw new GameError('wrong_phase', '다음 라운드 전쟁 허용/제재는 리더 협의 단계에서 입력합니다')
  if (g.day >= (g.total_days ?? 0)) throw new GameError('last_day', '마지막 라운드에는 다음 라운드가 없습니다')
  if (isWarSanctionOff()) throw new GameError('sanction_off', '전쟁 제재 금지가 켜져 있어 이번 협의에는 전쟁 제재 안건이 없습니다')
  setWarRule(g.day + 1, body.allowed)
  const msg = body.allowed
    ? `리더 협의 결과: ${g.day + 1}라운드 전쟁 허용`
    : `리더 협의 결과: ${g.day + 1}라운드 전쟁 제재 (전쟁 선포 불가)`
  emit('game', 'all', null, 'war.allowed', msg, req.auth!.sub, { day: g.day + 1, allowed: body.allowed })
  res.json(adminView())
}))

/**
 * 전쟁 제재 금지 on/off (2026-11-03). 켜면 리더 협의 안건에서 전쟁 제재가 빠진다 (전쟁은 항상 허용).
 * 리더 협의 단계 전에 정한다 (준비 상태 또는 진행 중 리더 협의가 아닌 단계). 이미 걸린 다음 라운드 금지는 바꾸지 않는다
 */
gameRouter.post('/admin/war/sanction-off', requireRole('admin'), handle(z.object({ on: z.boolean() }), (req, res, body) => {
  const g = getGameRow()
  if (g.status !== 'ready' && g.status !== 'running') throw new GameError('wrong_status', '준비 또는 진행 중에만 바꿀 수 있습니다')
  if (g.status === 'running' && g.phase === 'council') throw new GameError('wrong_phase', '전쟁 제재 금지는 리더 협의 단계 전에 정합니다')
  setWarSanctionOff(body.on)
  // 프레젠테이션·참가자 화면의 협의 안건 표시를 바로 갱신 (기록 없는 신호. 받은 화면은 게임 상태를 다시 조회)
  signalLobby()
  res.json(adminView())
}))

const warResultSchema = z.object({ result: z.enum(['attacker', 'defender']) })

/**
 * 관리자 결과 지정 (오프라인 게임 결과). 패배팀 재화의 절반(내림)을 승리팀이 가져간다 (골드는 빼고).
 * 결과(승리팀 이름)는 전체에, 오간 수량은 승리팀·패배팀(+진행자)에게만 (docs/100 D6-a).
 * 전쟁 종료 화면에서 재화가 넘어가고, 관리자가 다음 단계를 누르면 단계 공지 없이 리더 협의로 넘어간다 (docs/103 §4)
 */
gameRouter.post('/admin/war/:id/resolve', requireRole('admin'), handle(warResultSchema, (req, res, body) => {
  const g = requireRunning()
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) throw new GameError('not_found', '', 404)
  const by = req.auth!.sub
  const r = resolveWar(id, body.result, g.day, by)
  const pair = `${teamName(r.war.attacker)} → ${teamName(r.war.defender)}`
  emit('game', 'all', null, 'war.resolved', `전쟁 종료: ${josa(teamName(r.winner), '이/가')} 승리했습니다 (${pair}).`, by, { war: true, warId: id })
  const amounts = describeCost(r.spoils)
  emit('game', 'group', r.winner, 'war.spoils', `전리품: ${amounts === '없음' ? '없음 (상대 팀 재화 0)' : amounts}`, by, { war: true, warId: id })
  emit('game', 'group', r.loser, 'war.lost', amounts === '없음' ? '전쟁 패배: 빼앗긴 재화 없음 (보유 0)' : `전쟁 패배: ${amounts} 을 빼앗겼습니다`, by, { war: true, warId: id })
  res.json(adminView())
}))

/** 이번 라운드 전쟁의 승패 팀에게만: 오간 재화 */
function teamWarResult(day: number, teamId: number): TeamGameView['warResult'] {
  const w = getWarOfDay(day)
  if (!w?.spoils || (w.attacker !== teamId && w.defender !== teamId)) return null
  return { won: warWinner(w) === teamId, spoils: w.spoils }
}

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


// ---- 참가자(리더): 라이프 제출 ----

/** 발표 전에는 팀 화면에 생존자·탈락자를 보내지 않는다 */
function hiddenUntilReveal(sub: LifeSubmissionView | null): LifeSubmissionView | null {
  return sub && !sub.revealed ? { ...sub, saved: [], eliminated: [], names: {} } : sub
}

/** 탈락자를 팀별로 차례로 발표하고 탈락 처리한다. 반환: 탈락한 사람 전체 (세션을 끊는 건 호출하는 쪽) */
function announceLifeResults(day: number, by: number): number[] {
  const results = revealLifeResults(day)
  if (results.length === 0) return []
  emit('game', 'all', null, 'life.all_done', '모든 팀의 라이프가 제출되었습니다.', by, { day, ...NOTIFY_SELF })
  const losing = results.filter((r) => r.eliminated.length)
  const lines = losing.map((r) => `${teamName(r.teamId)}의 ${r.eliminated.map(userName).join(', ')}`)
  const last = lines.pop()
  emit('game', 'all', null, 'life.eliminated', last
    ? ['이번 라운드의 탈락자가 발생했습니다.', ...lines, `${josa(last, '은/는')} 게임을 중단하고 탈락자 공간으로 이동해주시기 바랍니다.`].join('\n')
    : '이번 라운드 탈락자는 없습니다.', by, { day })
  announceMigrationSweep(by)
  signalLobby() // 프레젠테이션 팀 현황(탈락 표시)
  return losing.flatMap((r) => r.eliminated)
}

/** count = 살릴 인원 (라이프 0개 팀은 0). 생존자는 서버가 무작위로 정한다 */
const lifeSchema = z.object({ count: z.number().int().min(0).max(100), selfEliminate: z.boolean() })

gameRouter.post('/game/life', requireRole('member'), handle(lifeSchema, (req, res, body) => {
  const g = requireRunning('life')
  const teamId = requireLeader(req)
  const by = req.auth!.sub
  const sub = submitLife(g.day, teamId, by, body)
  emit('game', 'group', teamId, 'life.submitted', '라이프를 제출했습니다. 모든 팀이 제출하면 결과를 발표합니다', by, { day: g.day, ...NOTIFY_SELF })
  const out = allLivesDone(g.day) ? announceLifeResults(g.day, by) : []
  res.json({ submission: hiddenUntilReveal(sub) })
  // 응답을 먼저 보낸 뒤 세션을 끊는다. 탈락자 화면은 확인을 누르면 로그아웃한다
  endSessions(out, 'eliminated')
}))

// ---- 참가자(리더): 보석·골드 발행 (요청 즉시 발행, docs/103 §9) ----

/**
 * 화이트(보석)·골드(골드) 리더. 되돌릴 수 없다. 알림은 모두 무음(muted), 문구는 수락 때와 같다 (docs/97).
 * - 보석: 화이트팀만 (다른 팀·프레젠테이션은 모른다)
 * - 골드: 이번 발행 수량을 전체에 1회 공개. 마지막 라운드 골드는 공개하지 않는다 (골드팀만, docs/100 D4). 공개는 최종장(N2) 때
 */
gameRouter.post('/issue/request', requireRole('member'), handle(z.object({ amount: z.number().int().min(1).max(100_000) }), (req, res, body) => {
  const teamId = requireLeader(req)
  const by = req.auth!.sub
  const r = requestIssue(teamId, body.amount, by)
  const extra = { issueId: r.id, status: r.status, muted: true, ...NOTIFY_SELF }
  if (r.kind === 'gold' && r.day >= (getGameRow().total_days ?? Infinity)) {
    emit('game', 'group', r.teamId, 'issue.decided', `${issueText(r)} 발행 완료 (골드 +${r.amount} · 마지막 라운드라 공개되지 않습니다)`, by, extra)
  } else if (r.kind === 'gold') {
    emit('game', 'all', null, 'issue.decided', `${josa(teamName(r.teamId), '이/가')} 골드 ${r.amount}개를 발행했습니다`, by, extra)
  } else {
    emit('game', 'group', r.teamId, 'issue.decided', `${issueText(r)} 발행 완료 (보석 +${r.amount})`, by, extra)
  }
  res.json({ issue: getTeamIssue(teamId) })
}))

// ---- 참가자(리더): 전쟁 선포 (즉시 시작, docs/103 §4) ----

/**
 * 거래 단계, 리더만. 선포 즉시 비용 차감(소멸) → 진행 중 거래 취소 → 전체 강조 공지(소리 있음).
 * 두 팀이 동시에 선포하면 먼저 들어온 것만 유효 (나중 것은 war_used). 리더 협의로 금지된 라운드면 war_banned
 */
gameRouter.post('/war/declare', requireRole('member'), handle(z.object({ defenderId: z.number().int().positive() }), (req, res, body) => {
  const g = requireRunning('trade')
  const teamId = requireLeader(req)
  const by = req.auth!.sub
  const { war } = declareWar(g.day, teamId, body.defenderId, by)
  schedulePhaseTimer() // 전쟁 중에는 거래 시간이 끝났다는 알림을 보내지 않는다
  emit('game', 'group', war.attacker, 'resources.updated', `전쟁 선포 비용: ${describeCost(war.cost)} (소멸)`, by, { silent: true })
  emit('game', 'all', null, 'war.declared', `전쟁이 선포되었습니다 (${teamName(war.attacker)} → ${teamName(war.defender)})`, by, {
    war: true, warId: war.id, attacker: war.attacker, defender: war.defender, ...NOTIFY_SELF,
  })
  res.json({ ok: true })
}))

// ---- 거래 (docs/103 §10): 진행자 입력 → 즉시 체결 (2026-11-02 리더 수락 단계 삭제) ----

const giveText = (o: Resources) => describeDeltas(o).replaceAll('+', '') || '없음'
const tradeSummary = (t: TradeView) =>
  `${teamName(t.from.teamId)} (${giveText(t.from.offer)}) ↔ ${teamName(t.to.teamId)} (${giveText(t.to.offer)}) · 크레딧 ${teamName(t.creditPayer)} 부담`

const tradeProposalSchema = z.object({
  fromTeamId: z.number().int().positive(),
  toTeamId: z.number().int().positive(),
  creditPayer: z.number().int().positive(),
  fromOffer: resourcesSchema,
  toOffer: resourcesSchema,
})

/** 진행자가 오프라인 협의 내용을 입력하면 바로 체결된다 */
gameRouter.post('/admin/game/trade', requireRole('admin'), handle(tradeProposalSchema, (req, res, body) => {
  const g = requireRunning('trade')
  const by = req.auth!.sub
  const t = executeTrade(g.day, { fromTeam: body.fromTeamId, toTeam: body.toTeamId, creditPayer: body.creditPayer, fromOffer: body.fromOffer, toOffer: body.toOffer }, by, teamName)
  const msg = `거래 완료: ${tradeSummary(t)}`
  announceTrade(t, 'trade.completed', { from: msg, to: msg }, by, NOTIFY_SELF)
  emit('game', 'group', t.creditPayer, 'resources.updated', '거래 크레딧: 크레딧 -1', by, { silent: true })
  res.json(adminView())
}))
