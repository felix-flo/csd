/**
 * 게임 전역 상태 (game 테이블 1행) 와 진행 제어.
 * - setup  : 관리자가 총 일수·팀별 최대 인원·테스트 계정 포함·팀별 초기 재화를 설정 (라이프 매장량은 2026-10-30 폐지, docs/103 §3)
 * - ready  : "초기셋팅완료" 로 진입. 최대 인원 합계만큼 팀 없는 PIN 을 만들고, 참가자가 로그인해 이름을 입력하고 팀(A, B, C…)을 고른다.
 *            설정은 계속 바꿀 수 있고 setup 으로 되돌릴 수도 있다 (배정된 참가자 유지). 관리자가 팀별 리더를 지정해야 시작할 수 있다
 * - running: day 1..totalDays, phase 는 PHASES 순서. 관리자 "다음 단계" 로만 넘어간다. 라이프 제출 다음은 +1일 리더 선출
 * - final  : 최종장 (docs/100 N2). 마지막 라운드 라이프 제출이 끝나면 관리자 "게임 종료" 로 진입. 최종 투표 → 결과 발표 → 정산 (db/final.ts)
 * - ended  : 정산 뒤 관리자가 게임을 끝낸다
 * - reset  : 참가자·진행자 계정을 모두 지우고(고정 관리자·프레젠테이션만 남김) 진행 기록과 알림을 전부 비운 뒤 setup 으로.
 *            시드 테스트 계정은 고정 PIN 으로 다시 만든다. 팀 정의·룰 문서·설정값(총 일수 제외)은 유지
 */
import { db } from './index.js'
import { createUser, generatePin, listGroupMembers, listGroups, setUsersActive } from './users.js'
import { ensureLeader } from './teams.js'
import { createSeedUsers, TEST_USERS } from './seed.js'
import {
  clearLedger, getAllResources, recordInitialLedger, resetAmountsToInitial, setInitialResources,
} from './resources.js'
import { allElectionsDone, clearElections, finalizeElection, openElections, type FinalizeResult } from './election.js'
import { cancelActiveTrade, clearTrades } from './trades.js'
import { allLivesDone, clearLifeSubmissions } from './life.js'
import { cancelPendingIssues, clearIssues, publicGoldIssued } from './issuance.js'
import { clearCouncilActions } from './council.js'
import { clearWars, getActiveWar, getPublicWar, getWarCost, setWarCost } from './war.js'
import { clearFinalVotes, getFinalState, isResultRevealed } from './final.js'
import { clearMigrations, pendingMigrations } from './migration.js'
import { clearSpy, prepareSpiesForStart } from './spy.js'
import { GameError } from './gameError.js'
import { PHASE_TIMER_SECONDS, DEFAULT_ISSUE_LIMITS, DEFAULT_LAST_ISSUE_PHASES, DEFAULT_MIGRATION_START_DAY, emptyResources, isBeforeStart, PHASE_LABELS, PHASES, sortPhases, sumResources, teamLetter } from '../../../shared/game.js'
import type { PhaseTimer,
  GameResults, GameSettings, GameState, GameStatus, IssueLimits, IssueRequestView, LobbyTeam, Phase, Resources, RosterTeam, TradeView, WarCost,
} from '../../../shared/game.js'
import type { GroupInfo } from '../../../shared/types.js'

/** 게임 제목. 시작 전에는 공개하지 않는다 (GameState.title). 클라이언트 번들에 들어가지 않게 서버에만 둔다 */
const GAME_TITLE = '더 트래픽 커뮤니티 2 : 보이지 않는 손'

interface GameRow {
  status: GameStatus
  phase_started_at: string | null
  phase_timer_fired: number
  total_days: number | null
  day: number
  phase: Phase | null
  include_test: number
  life_reserve_initial: number
  life_reserve: number
  aid_used: number
  results: string | null
  gem_issue_limit: number
  gold_issue_limit: number
  /** 마지막 라운드 발행 허용 단계 Phase[] JSON (docs/100 D4) */
  last_issue_phases: string
  /** 테스트 모드(탭 로그인, docs/101): 1 이면 로그인 때 리프레시 쿠키를 심지 않는다 */
  tab_login: number
  /** 마지막 라운드 라이프 투표권 안건: NULL 미입력 / 0 부결 / 1 통과 (docs/100 N2). 최종장 열은 db/final.ts 가 다룬다 */
  life_vote_passed: 0 | 1 | null
  /** 이주가 열리는 라운드 (docs/100 N3) */
  migration_start_day: number
}

/** 최종장 열을 비운다 (게임 시작·리셋) */
const CLEAR_FINAL = `final_step = NULL, life_vote_passed = NULL, votes_closed = 0, tiebreak = NULL, adopted = NULL`

/** 테스트 모드(탭 로그인) 여부. 로그인·재발급 라우터가 본다 */
export function isTabLogin(): boolean {
  return getGameRow().tab_login === 1
}

/** 테스트 모드 전환. 게임 상태와 무관하게 언제든. 리셋 "설정값 초기화" 때 꺼진다 */
export function setTabLogin(on: boolean) {
  updateGame('tab_login = ?', [on ? 1 : 0])
}

export function getGameRow(): GameRow {
  return db.prepare('SELECT * FROM game WHERE id = 1').get() as GameRow
}

function updateGame(set: string, params: unknown[] = []) {
  db.prepare(`UPDATE game SET ${set}, updated_at = datetime('now') WHERE id = 1`).run(...params)
}

/** SQLite datetime('now') ("YYYY-MM-DD HH:MM:SS", UTC) → Date */
function sqliteDate(s: string): Date {
  return new Date(s.replace(' ', 'T') + 'Z')
}

/** 단계 타이머 (거래·리더 협의, docs/103 §14). 단계 시작 시각 + 길이 */
export function getPhaseTimer(g: GameRow = getGameRow()): PhaseTimer | null {
  if (g.status !== 'running' || !g.phase || !g.phase_started_at) return null
  const seconds = PHASE_TIMER_SECONDS[g.phase]
  if (!seconds) return null
  const start = sqliteDate(g.phase_started_at)
  return { phase: g.phase, endsAt: new Date(start.getTime() + seconds * 1000).toISOString(), serverNow: new Date().toISOString(), seconds, fired: g.phase_timer_fired === 1 }
}

/** 타이머 종료 알림을 보냈다고 표시. 아직 같은 단계이고 안 보냈을 때만 true (스케줄러가 호출) */
export function markPhaseTimerFired(day: number, phase: Phase): boolean {
  return db.prepare(`UPDATE game SET phase_timer_fired = 1 WHERE id = 1 AND status = 'running' AND day = ? AND phase = ? AND phase_timer_fired = 0`).run(day, phase).changes === 1
}

export function getGameState(): GameState {
  const g = getGameRow()
  const { initial } = getAllResources()
  const teamIds = new Set(listGroups().map((t) => t.id))
  return {
    status: g.status,
    totalDays: g.total_days,
    day: g.day,
    phase: g.phase,
    leadersDone: g.status === 'running' && allElectionsDone(g.day),
    livesDone: g.status === 'running' && g.phase === 'life' && allLivesDone(g.day),
    timer: getPhaseTimer(g),
    initialTotals: sumResources([...initial].filter(([id]) => teamIds.has(id)).map(([, r]) => r)),
    results: g.results ? (JSON.parse(g.results) as GameResults) : null,
    lifeVote: g.life_vote_passed == null ? null : g.life_vote_passed === 1,
    final: getFinalState(),
    lobby: g.status === 'ready' ? getLobby() : null,
    title: isBeforeStart(g.status) ? null : GAME_TITLE,
    war: getPublicWar(g.day, g.status === 'running'),
    // 마지막 라운드 골드는 최종장 결과 발표부터 포함 (docs/100 N2)
    goldIssued: isBeforeStart(g.status) ? null : publicGoldIssued(isResultRevealed() ? null : g.total_days),
  }
}

/** 팀별 일반 참가자 수 (테스트 계정 제외, 비활성 포함). 정원 계산은 여기에 activeTestCount 를 더한다 */
function countRegular(teamId: number): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'member' AND is_test = 0 AND group_id = ?`).get(teamId) as { n: number }).n
}

function capacityOf(teamId: number): number {
  return (db.prepare('SELECT capacity FROM groups WHERE id = ?').get(teamId) as { capacity: number } | undefined)?.capacity ?? 0
}

/** 팀 선택 현황. 팀 순서대로 A, B, C … */
export function getLobby(): LobbyTeam[] {
  return listGroups().map((t, i) => ({ teamId: t.id, label: teamLetter(i), count: countRegular(t.id) + activeTestCount(t.id), capacity: capacityOf(t.id) }))
}

export function getSettings(): GameSettings {
  const g = getGameRow()
  const { initial } = getAllResources()
  return {
    totalDays: g.total_days,
    capacity: Object.fromEntries(listGroups().map((t) => [t.id, capacityOf(t.id)])),
    includeTest: g.include_test === 1,
    initial: Object.fromEntries(listGroups().map((t) => [t.id, initial.get(t.id) ?? emptyResources()])),
    issueLimit: { gem: g.gem_issue_limit, gold: g.gold_issue_limit },
    warCost: getWarCost(1),
    lastIssuePhases: parsePhases(g.last_issue_phases),
    tabLogin: g.tab_login === 1,
    migrationStartDay: g.migration_start_day,
  }
}

function parsePhases(json: string): Phase[] {
  return JSON.parse(json) as Phase[]
}

/** 진행 중 마지막 라운드인지 */
function isLastRound(g: GameRow): boolean {
  return g.status === 'running' && g.day >= (g.total_days ?? Infinity)
}

/**
 * 마지막 라운드 발행 허용 단계 저장 (docs/100 D4). 시작 전, 또는 진행 중 마지막 라운드 전날까지.
 * 마지막 라운드가 시작되면 고정
 */
export function setLastIssuePhases(phases: Phase[]) {
  const g = getGameRow()
  if (g.status === 'final' || g.status === 'ended') throw new GameError('ended', '게임이 끝났습니다')
  if (isLastRound(g)) throw new GameError('last_round_locked', '마지막 라운드가 시작되어 발행 단계를 바꿀 수 없습니다')
  const sorted = sortPhases(phases)
  if (!sorted.length) throw new GameError('no_phase', '발행을 허용할 단계를 1개 이상 고르세요', 400)
  updateGame('last_issue_phases = ?', [JSON.stringify(sorted)])
}

/** 진행 중 전쟁이 있으면 단계 넘기기·게임 종료 불가 */
function requireNoWar() {
  if (getActiveWar()) throw new GameError('war_active', '전쟁 결과를 먼저 정하세요')
}

export function requireRunning(phase?: Phase): GameRow {
  const g = getGameRow()
  if (g.status !== 'running') throw new GameError('not_running', '게임이 진행 중이 아닙니다')
  if (phase && g.phase !== phase) throw new GameError('wrong_phase', '지금은 할 수 없는 단계입니다')
  return g
}

/**
 * 테스트 계정 포함/제외 적용. 제외 = 비활성 (로그인 차단). 반환: 비활성으로 바뀐 id (세션 종료용)
 */
function applyTestAccounts(include: boolean): number[] {
  // 테스트 계정은 팀별 최대 인원에 포함된다 (2026-10-29): 팀마다 리더 → 팀원 순으로 최대 인원까지만 활성, 나머지는 비활성
  const rows = db
    .prepare(`SELECT id, active, group_id, is_leader FROM users WHERE role = 'member' AND is_test = 1 ORDER BY group_id, is_leader DESC, id`)
    .all() as { id: number; active: number; group_id: number | null; is_leader: number }[]
  const slotsLeft = new Map<number, number>()
  for (const t of listGroups()) slotsLeft.set(t.id, capacityOf(t.id))
  const on: number[] = []
  const off: number[] = []
  for (const r of rows) {
    const left = r.group_id != null ? (slotsLeft.get(r.group_id) ?? 0) : 0
    const want = include && left > 0
    if (want && r.group_id != null) slotsLeft.set(r.group_id, left - 1)
    if (r.active !== (want ? 1 : 0)) (want ? on : off).push(r.id)
  }
  setUsersActive(on, true)
  setUsersActive(off, false)
  for (const t of listGroups()) ensureLeader(t.id)
  return off
}

/** 팀의 활성 테스트 계정 수 (최대 인원에 포함) */
function activeTestCount(teamId: number): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'member' AND is_test = 1 AND active = 1 AND group_id = ?`).get(teamId) as { n: number }).n
}

/** 설정 저장 (setup·ready). ready 에서 최대 인원을 바꾸면 PIN 수를 맞춘다. 반환: 비활성으로 바뀐 테스트 계정 id + 지운 미사용 PIN id */
export function saveSettings(input: {
  totalDays: number | null
  capacity: Record<string, number>
  includeTest: boolean
  initial: Record<string, Resources>
  /** 없으면 기존 값 유지 */
  issueLimit?: IssueLimits
  /** 1일차 전쟁 선포 비용. 없으면 기존 값 유지 */
  warCost?: WarCost
  /** 마지막 라운드 발행 허용 단계. 없으면 기존 값 유지 */
  lastIssuePhases?: Phase[]
  /** 이주 시작 라운드. 없으면 기존 값 유지 */
  migrationStartDay?: number
}): number[] {
  return db.transaction(() => {
    const status = getGameRow().status
    if (status !== 'setup' && status !== 'ready') throw new GameError('not_setup', '게임 설정은 시작 전에만 바꿀 수 있습니다')
    const teamIds = new Set(listGroups().map((t) => t.id))
    for (const key of [...Object.keys(input.initial), ...Object.keys(input.capacity)]) {
      if (!teamIds.has(Number(key))) throw new GameError('unknown_team', key, 400)
    }
    for (const [key, r] of Object.entries(input.initial)) setInitialResources(Number(key), r)
    const setCap = db.prepare('UPDATE groups SET capacity = ? WHERE id = ?')
    for (const [key, cap] of Object.entries(input.capacity)) {
      const teamId = Number(key)
      const joined = countRegular(teamId)
      if (cap < joined) throw new GameError('below_joined', `${teamLabel(teamId)} 에 이미 ${joined}명이 들어와 있습니다`, 400)
      setCap.run(cap, teamId)
    }
    if (status === 'ready' && listGroups().some((t) => capacityOf(t.id) < 1)) throw new GameError('no_capacity', '모든 팀의 최대 인원은 1명 이상이어야 합니다', 400)
    resetAmountsToInitial()
    updateGame('total_days = ?, include_test = ?', [input.totalDays, input.includeTest ? 1 : 0])
    if (input.warCost) setWarCost(1, input.warCost)
    if (input.lastIssuePhases) setLastIssuePhases(input.lastIssuePhases)
    if (input.migrationStartDay) updateGame('migration_start_day = ?', [input.migrationStartDay])
    if (input.issueLimit) updateGame('gem_issue_limit = ?, gold_issue_limit = ?', [input.issueLimit.gem, input.issueLimit.gold])
    const ended = applyTestAccounts(input.includeTest)
    if (status === 'ready') ended.push(...syncParticipantPins().deleted)
    return ended
  })()
}

function teamLabel(teamId: number): string {
  const teams = listGroups()
  const i = teams.findIndex((t) => t.id === teamId)
  return i < 0 ? `#${teamId}` : `${teamLetter(i)} (${teams[i]!.name})`
}

/**
 * 일반 참가자 PIN 수를 최대 인원 합계에 맞춘다.
 * 모자라면 팀 없는 PIN 을 만들고('참가자 N', 이름 미입력), 남으면 아직 이름도 입력하지 않은 팀 없는 PIN 만 최근 것부터 지운다
 * (이미 들어온 사람은 지우지 않으므로 남는 PIN 이 있을 수 있다 → 시작할 때 미배정은 비활성)
 */
function syncParticipantPins(): { created: number; deleted: number[] } {
  // 최대 인원에서 활성 테스트 계정을 뺀 만큼만 참가자 PIN 을 만든다
  const target = listGroups().reduce((sum, t) => sum + Math.max(0, capacityOf(t.id) - activeTestCount(t.id)), 0)
  const current = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'member' AND is_test = 0`).get() as { n: number }).n
  const result = { created: 0, deleted: [] as number[] }
  if (current < target) {
    let seq = current
    for (let i = current; i < target; i++) {
      seq++
      createUser({ name: `참가자 ${seq}`, role: 'member', pin: generatePin(), nameSet: false })
      result.created++
    }
  } else if (current > target) {
    const spare = db
      .prepare(`SELECT id FROM users WHERE role = 'member' AND is_test = 0 AND group_id IS NULL AND name_set = 0 ORDER BY id DESC LIMIT ?`)
      .all(current - target) as { id: number }[]
    result.deleted = spare.map((r) => r.id)
    if (result.deleted.length) db.prepare(`DELETE FROM users WHERE id IN (${result.deleted.map(() => '?').join(',')})`).run(...result.deleted)
  }
  return result
}

/** 초기셋팅완료: setup → ready. 최대 인원 합계만큼 팀 없는 PIN 을 만든다 */
export function prepareGame(): number[] {
  return db.transaction(() => {
    const g = getGameRow()
    if (g.status !== 'setup') throw new GameError('not_setup', '설정 단계에서만 할 수 있습니다')
    if (!g.total_days) throw new GameError('no_days', '총 라운드 수를 먼저 설정하세요')
    if (listGroups().length === 0) throw new GameError('no_teams', '팀이 없습니다')
    const empty = listGroups().filter((t) => capacityOf(t.id) < 1)
    if (empty.length) throw new GameError('no_capacity', `최대 인원을 정하세요: ${empty.map((t) => t.name).join(', ')}`)
    const ended = applyTestAccounts(g.include_test === 1)
    ended.push(...syncParticipantPins().deleted)
    updateGame(`status = 'ready'`)
    return ended
  })()
}

/** 준비 → 설정으로 되돌리기. 팀을 고른 참가자는 그대로 둔다 */
export function revertToSetup() {
  const ok = db.prepare(`UPDATE game SET status = 'setup', updated_at = datetime('now') WHERE id = 1 AND status = 'ready'`).run().changes === 1
  if (!ok) throw new GameError('not_ready', '준비 상태에서만 할 수 있습니다')
}

export type JoinError = 'not_ready' | 'not_found' | 'already_joined' | 'name_required' | 'test_account' | 'team_full'

/**
 * 참가자 본인 팀 선택 (준비 상태, 1회). 정원 확인과 배정을 한 트랜잭션에서 하므로 마지막 자리를 동시에 골라도 한 명만 들어간다.
 * group_id IS NULL 조건부 갱신으로 같은 사람이 두 번 눌러도 한 번만 반영된다.
 */
export function joinTeam(userId: number, teamId: number): GroupInfo {
  return db.transaction(() => {
    if (getGameRow().status !== 'ready') throw new GameError('not_ready', '팀 선택 시간이 아닙니다')
    const u = db.prepare(`SELECT group_id, name_set, is_test FROM users WHERE id = ? AND role = 'member' AND active = 1`).get(userId) as
      | { group_id: number | null; name_set: number; is_test: number }
      | undefined
    const team = listGroups().find((t) => t.id === teamId)
    if (!u || !team) throw new GameError('not_found', '', 404)
    if (u.is_test === 1) throw new GameError('test_account', '테스트 계정은 팀이 정해져 있습니다')
    if (u.group_id != null) throw new GameError('already_joined', '이미 팀을 골랐습니다. 바꾸려면 진행자에게 요청하세요')
    if (u.name_set !== 1) throw new GameError('name_required', '이름을 먼저 입력하세요', 400)
    if (countRegular(teamId) + activeTestCount(teamId) >= capacityOf(teamId)) throw new GameError('team_full', '팀이 가득 찼습니다')
    const ok = db.prepare('UPDATE users SET group_id = ?, is_leader = 0 WHERE id = ? AND group_id IS NULL').run(teamId, userId).changes === 1
    if (!ok) throw new GameError('already_joined', '이미 팀을 골랐습니다')
    return team
  })()
}

/** 시작 전 점검: 미배정 활성 참가자 수, 리더가 없는 팀 */
export function getPrep(): { unassigned: number; noLeader: number[] } {
  const unassigned = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'member' AND active = 1 AND group_id IS NULL`).get() as { n: number }).n
  const noLeader = listGroups()
    .filter((t) => {
      const members = listGroupMembers(t.id)
      return members.length > 0 && !members.some((m) => m.isLeader)
    })
    .map((t) => t.id)
  return { unassigned, noLeader }
}

/** 게임 시작: ready → running. 반환: 비활성으로 바뀐 계정 id (팀을 고르지 않은 참가자, 제외된 테스트 계정) */
export function startGame(by: number): number[] {
  return db.transaction(() => {
    const g = getGameRow()
    if (g.status !== 'ready') throw new GameError('not_ready', '초기셋팅완료 후 준비 상태에서 시작할 수 있습니다')
    if (!g.total_days) throw new GameError('no_days', '총 라운드 수를 먼저 설정하세요')
    const deactivated = applyTestAccounts(g.include_test === 1)
    // 팀을 고르지 않은 참가자는 비활성 (관리자가 나중에 팀에 넣고 복귀시킬 수 있다)
    const unassigned = (db.prepare(`SELECT id FROM users WHERE role = 'member' AND active = 1 AND group_id IS NULL`).all() as { id: number }[]).map((r) => r.id)
    setUsersActive(unassigned, false)
    deactivated.push(...unassigned)
    // 테러리스트 (docs/100 N4): 후보가 있으면 1명 이상 지정해야 시작. 시작 명단을 남긴다 (적립 기준)
    prepareSpiesForStart()
    const { noLeader } = getPrep()
    if (noLeader.length) throw new GameError('no_leader', `리더를 지정하세요: ${noLeader.map(teamLabel).join(', ')}`)
    if (!getWarCost(1)) throw new GameError('no_war_cost', '게임 설정에서 1라운드 전쟁 선포 비용을 저장하세요')
    clearWars()
    clearLedger()
    clearElections()
    clearTrades()
    clearLifeSubmissions()
    clearIssues()
    clearCouncilActions()
    clearFinalVotes()
    clearMigrations()
    resetAmountsToInitial()
    recordInitialLedger(1, by)
    updateGame(`status = 'running', day = 1, phase = 'leader', aid_used = 0, results = NULL, phase_started_at = datetime('now'), phase_timer_fired = 0,
                started_at = datetime('now'), ended_at = NULL, ${CLEAR_FINAL}`)
    // 시작 전에는 리더 표시를 그대로 두므로 여기서 정리 (비활성 리더 해제. 활성 리더는 위에서 팀마다 확인했다)
    for (const t of listGroups()) ensureLeader(t.id)
    openElections(1)
    return deactivated
  })()
}

export interface AdvanceResult {
  day: number
  phase: Phase
  /** 리더 선출 단계를 벗어나며 강제 집계된 팀 */
  finalized: { teamId: number; result: FinalizeResult }[]
  /** 거래 단계를 벗어나며 강제 취소된 거래 */
  cancelledTrade: TradeView | null
}

/**
 * 다음 단계로. expect 는 관리자 화면이 보고 있던 일차·단계 — 다르면 다른 관리자가 이미 넘긴 것이므로 거부 (중복 클릭 방지)
 */
export function advance(expect: { day: number; phase: Phase }): AdvanceResult {
  return db.transaction(() => {
    const g = requireRunning()
    if (g.day !== expect.day || g.phase !== expect.phase) throw new GameError('stale', '이미 다음 단계로 넘어갔습니다. 화면을 새로고침하세요')
    requireNoWar()
    const result: AdvanceResult = { day: g.day, phase: g.phase!, finalized: [], cancelledTrade: null }
    if (g.phase === 'leader') {
      for (const t of listGroups()) {
        const r = finalizeElection(g.day, t.id, true)
        if (r) result.finalized.push({ teamId: t.id, result: r })
      }
    }
    if (g.phase === 'trade') result.cancelledTrade = cancelActiveTrade()
    const idx = PHASES.indexOf(g.phase!)
    if (idx < PHASES.length - 1) {
      // 마지막 라운드 필수 안건(라이프 투표권)은 리더 협의 단계에서 통과/부결을 넣어야 넘어간다 (docs/100 N2-a′)
      if (isLastRound(g) && g.phase === 'council' && g.life_vote_passed == null) {
        throw new GameError('life_vote_undecided', '라이프 투표권 안건의 통과/부결을 먼저 입력하세요')
      }
      // 라이프 제출 단계에는 이주가 없으므로 대기 신청을 정리해야 넘어간다 (docs/100 N3-d)
      if (g.phase === 'council') {
        const pending = pendingMigrations()
        if (pending.length) {
          throw new GameError('migration_pending', `처리하지 않은 이주 신청이 있습니다 (${pending.map((m) => `${m.userName} → ${teamLabel(m.toTeamId)}`).join(', ')}). 받는 팀 리더가 처리하거나 진행자가 취소하세요`)
        }
      }
      result.phase = PHASES[idx + 1]!
      updateGame(`phase = ?, phase_started_at = datetime('now'), phase_timer_fired = 0`, [result.phase])
    } else {
      if (g.day >= (g.total_days ?? 0)) throw new GameError('last_day', '마지막 라운드입니다. 게임 종료를 누르세요')
      if (!getWarCost(g.day + 1)) throw new GameError('no_war_cost', `${g.day + 1}라운드 전쟁 선포 비용을 먼저 정하세요`)
      result.day = g.day + 1
      result.phase = 'leader'
      updateGame(`day = ?, phase = 'leader', phase_started_at = datetime('now'), phase_timer_fired = 0`, [result.day])
      openElections(result.day)
    }
    return result
  })()
}

/**
 * 게임 종료 = 최종장 시작 (running → final/vote, docs/100 N2).
 * 마지막 날의 턴이 모두 끝나야 한다: 라이프 제출 단계 + 모든 팀 제출 완료 (팀원 0·1명 팀은 완료로 본다).
 * 비상 조기 종료는 두지 않는다 (문제가 생기면 리셋). 진행 중 거래와 대기 중 발행 요청은 취소
 */
export function endGame(): { trade: TradeView | null; issues: IssueRequestView[] } {
  return db.transaction(() => {
    const g = requireRunning()
    if (g.day < (g.total_days ?? 0)) throw new GameError('not_last_day', '마지막 라운드에만 종료할 수 있습니다')
    requireNoWar()
    if (g.phase !== 'life' || !allLivesDone(g.day)) {
      throw new GameError('not_finished', '마지막 라운드 라이프 제출 단계에서 모든 팀이 제출해야 종료할 수 있습니다')
    }
    const trade = cancelActiveTrade()
    const issues = cancelPendingIssues()
    clearFinalVotes()
    updateGame(`status = 'final', phase = NULL, final_step = 'vote', votes_closed = 0, tiebreak = NULL, adopted = NULL, results = NULL`)
    return { trade, issues }
  })()
}

/**
 * 리셋: 처음부터 다시. 반환: 지운 계정 id (접속 중인 소켓을 끊는다)
 * - 참가자 전원과 진행자(고정 관리자 외 admin)를 삭제. refresh token·투표는 FK CASCADE 로 함께 지워진다
 * - 진행 기록(재화 이력·투표·거래·라이프)과 알림(공지 포함 모든 종류)을 비운다. events id 는 AUTOINCREMENT 라 재사용되지 않아 클라이언트 replay 가 꼬이지 않는다
 * - 시드 테스트 계정을 고정 PIN 으로 다시 만든다 (팀·리더 미리 배정)
 * - 팀 정의·룰 문서는 유지. 총 일수는 비운다
 * - 설정값(최대 인원·초기 재화·테스트 계정 포함·발행 한도)은 기본 유지. clearSettings 면 0 (테스트 계정은 포함, 발행 한도는 기본값 250/200) 으로 비운다
 */
export interface ResetResult {
  /** 지운 계정 id (접속 중인 소켓을 끊는다) */
  removed: number[]
  /** 지운 일반 참가자 수 (테스트 계정은 다시 만들어지므로 세지 않는다) */
  members: number
  staff: number
  events: number
  clearedSettings: boolean
}

export function resetGame(clearSettings = false): ResetResult {
  return db.transaction(() => {
    const rows = db.prepare(`SELECT id, role, is_test FROM users WHERE role = 'member' OR (role = 'admin' AND is_fixed = 0)`).all() as { id: number; role: string; is_test: number }[]
    const removed = rows.map((r) => r.id)
    clearTrades()
    clearElections()
    clearLifeSubmissions()
    clearIssues()
    clearWars()
    clearCouncilActions()
    clearFinalVotes()
    clearMigrations()
    clearSpy()
    clearLedger()
    const events = db.prepare('DELETE FROM events').run().changes
    if (removed.length) db.prepare(`DELETE FROM users WHERE id IN (${removed.map(() => '?').join(',')})`).run(...removed)
    createSeedUsers(TEST_USERS)
    if (clearSettings) {
      db.prepare('UPDATE groups SET capacity = 0').run()
      db.prepare('UPDATE team_resources SET initial = 0').run()
      updateGame('include_test = 1, tab_login = 0, gem_issue_limit = ?, gold_issue_limit = ?, last_issue_phases = ?, migration_start_day = ?', [
        DEFAULT_ISSUE_LIMITS.gem, DEFAULT_ISSUE_LIMITS.gold, JSON.stringify(DEFAULT_LAST_ISSUE_PHASES), DEFAULT_MIGRATION_START_DAY,
      ])
      setWarCost(1, { gem: 0, gold: 0, credit: 0 })
    }
    resetAmountsToInitial()
    updateGame(`status = 'setup', total_days = NULL, day = 0, phase = NULL, aid_used = 0,
                results = NULL, started_at = NULL, ended_at = NULL, ${CLEAR_FINAL}`)
    applyTestAccounts(getGameRow().include_test === 1)
    return {
      removed,
      members: rows.filter((r) => r.role === 'member' && r.is_test === 0).length,
      staff: rows.filter((r) => r.role === 'admin').length,
      events,
      clearedSettings: clearSettings,
    }
  })()
}

/**
 * 프레젠테이션 팀 현황: 팀별 팀원 명단 (탈락 = 비활성). 테스트 계정은 "포함" 설정일 때만.
 * 게임 시작 전에는 실제 팀 이름을 숨기므로 라우터가 막는다
 */
export function getPublicRoster(): RosterTeam[] {
  const includeTest = getGameRow().include_test === 1
  const rows = db
    .prepare(
      `SELECT group_id, name, is_leader, active FROM users
       WHERE role = 'member' AND group_id IS NOT NULL AND (is_test = 0 OR ?)
       ORDER BY is_leader DESC, id`,
    )
    .all(includeTest ? 1 : 0) as { group_id: number; name: string; is_leader: number; active: number }[]
  return listGroups().map((t) => ({
    teamId: t.id,
    name: t.name,
    color: t.color,
    members: rows
      .filter((r) => r.group_id === t.id)
      .map((r) => ({ name: r.name, isLeader: r.is_leader === 1 && r.active === 1, eliminated: r.active === 0 })),
  }))
}

/** 팀별 활성 인원 */
export function activeMemberCount(teamId: number): number {
  return listGroupMembers(teamId).length
}
