/**
 * 게임 전역 상태 (game 테이블 1행) 와 진행 제어.
 * - setup  : 관리자가 총 일수·팀별 최대 인원·테스트 계정 포함·라이프 매장량·팀별 초기 재화를 설정
 * - ready  : "초기셋팅완료" 로 진입. 최대 인원 합계만큼 팀 없는 PIN 을 만들고, 참가자가 로그인해 이름을 입력하고 팀(A, B, C…)을 고른다.
 *            설정은 계속 바꿀 수 있고 setup 으로 되돌릴 수도 있다 (배정된 참가자 유지). 관리자가 팀별 리더를 지정해야 시작할 수 있다
 * - running: day 1..totalDays, phase 는 PHASES 순서. 관리자 "다음 단계" 로만 넘어간다. 라이프 제출 다음은 +1일 리더 선출
 * - ended  : 마지막 날에 관리자가 종료. 환산 규칙을 골라 등수를 발표한다
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
import { GameError } from './gameError.js'
import { emptyResources, PHASES, rankTeams, sumResources, teamLetter } from '../../../shared/game.js'
import type { GameResults, GameSettings, GameState, GameStatus, LobbyTeam, Phase, Resources, ScoreRule, TradeView } from '../../../shared/game.js'
import type { GroupInfo } from '../../../shared/types.js'

interface GameRow {
  status: GameStatus
  total_days: number | null
  day: number
  phase: Phase | null
  include_test: number
  life_reserve_initial: number
  life_reserve: number
  aid_used: number
  results: string | null
}

export function getGameRow(): GameRow {
  return db.prepare('SELECT * FROM game WHERE id = 1').get() as GameRow
}

function updateGame(set: string, params: unknown[] = []) {
  db.prepare(`UPDATE game SET ${set}, updated_at = datetime('now') WHERE id = 1`).run(...params)
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
    initialTotals: sumResources([...initial].filter(([id]) => teamIds.has(id)).map(([, r]) => r)),
    results: g.results ? (JSON.parse(g.results) as GameResults) : null,
    lobby: g.status === 'ready' ? getLobby() : null,
  }
}

/** 팀별 일반 참가자 수 (테스트 계정 제외, 비활성 포함) */
function countRegular(teamId: number): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'member' AND is_test = 0 AND group_id = ?`).get(teamId) as { n: number }).n
}

function capacityOf(teamId: number): number {
  return (db.prepare('SELECT capacity FROM groups WHERE id = ?').get(teamId) as { capacity: number } | undefined)?.capacity ?? 0
}

/** 팀 선택 현황. 팀 순서대로 A, B, C … */
export function getLobby(): LobbyTeam[] {
  return listGroups().map((t, i) => ({ teamId: t.id, label: teamLetter(i), count: countRegular(t.id), capacity: capacityOf(t.id) }))
}

export function getSettings(): GameSettings {
  const g = getGameRow()
  const { initial } = getAllResources()
  return {
    totalDays: g.total_days,
    capacity: Object.fromEntries(listGroups().map((t) => [t.id, capacityOf(t.id)])),
    includeTest: g.include_test === 1,
    lifeReserve: g.life_reserve_initial,
    initial: Object.fromEntries(listGroups().map((t) => [t.id, initial.get(t.id) ?? emptyResources()])),
  }
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
  const rows = db.prepare(`SELECT id, active FROM users WHERE role = 'member' AND is_test = 1`).all() as { id: number; active: number }[]
  const want = include ? 1 : 0
  const changed = rows.filter((r) => r.active !== want).map((r) => r.id)
  setUsersActive(changed, include)
  for (const t of listGroups()) ensureLeader(t.id)
  return include ? [] : changed
}

/** 설정 저장 (setup·ready). ready 에서 최대 인원을 바꾸면 PIN 수를 맞춘다. 반환: 비활성으로 바뀐 테스트 계정 id + 지운 미사용 PIN id */
export function saveSettings(input: {
  totalDays: number | null
  capacity: Record<string, number>
  includeTest: boolean
  lifeReserve: number
  initial: Record<string, Resources>
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
    updateGame('total_days = ?, include_test = ?, life_reserve_initial = ?, life_reserve = ?', [
      input.totalDays, input.includeTest ? 1 : 0, input.lifeReserve, input.lifeReserve,
    ])
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
  const target = listGroups().reduce((sum, t) => sum + capacityOf(t.id), 0)
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
    if (!g.total_days) throw new GameError('no_days', '총 일수를 먼저 설정하세요')
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
    if (countRegular(teamId) >= capacityOf(teamId)) throw new GameError('team_full', '팀이 가득 찼습니다')
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
    if (!g.total_days) throw new GameError('no_days', '총 일수를 먼저 설정하세요')
    const deactivated = applyTestAccounts(g.include_test === 1)
    // 팀을 고르지 않은 참가자는 비활성 (관리자가 나중에 팀에 넣고 복귀시킬 수 있다)
    const unassigned = (db.prepare(`SELECT id FROM users WHERE role = 'member' AND active = 1 AND group_id IS NULL`).all() as { id: number }[]).map((r) => r.id)
    setUsersActive(unassigned, false)
    deactivated.push(...unassigned)
    const { noLeader } = getPrep()
    if (noLeader.length) throw new GameError('no_leader', `리더를 지정하세요: ${noLeader.map(teamLabel).join(', ')}`)
    clearLedger()
    clearElections()
    clearTrades()
    clearLifeSubmissions()
    resetAmountsToInitial()
    recordInitialLedger(1, by)
    updateGame(`status = 'running', day = 1, phase = 'leader', life_reserve = life_reserve_initial, aid_used = 0, results = NULL,
                started_at = datetime('now'), ended_at = NULL`)
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
      result.phase = PHASES[idx + 1]!
      updateGame('phase = ?', [result.phase])
    } else {
      if (g.day >= (g.total_days ?? 0)) throw new GameError('last_day', '마지막 날입니다. 게임 종료를 누르세요')
      result.day = g.day + 1
      result.phase = 'leader'
      updateGame(`day = ?, phase = 'leader'`, [result.day])
      openElections(result.day)
    }
    return result
  })()
}

/** 마지막 날에만. 진행 중 거래는 취소 */
export function endGame(): TradeView | null {
  return db.transaction(() => {
    const g = requireRunning()
    if (g.day < (g.total_days ?? 0)) throw new GameError('not_last_day', '마지막 날에만 종료할 수 있습니다')
    const cancelled = cancelActiveTrade()
    updateGame(`status = 'ended', phase = NULL, ended_at = datetime('now')`)
    return cancelled
  })()
}

/** 등수 계산·발표 (종료 후, 여러 번 가능 — 마지막 발표가 표시된다) */
export function publishResults(rule: ScoreRule): GameResults {
  return db.transaction(() => {
    if (getGameRow().status !== 'ended') throw new GameError('not_ended', '게임 종료 후에 발표할 수 있습니다')
    const { amount } = getAllResources()
    const teams = listGroups().map((t) => {
      const r = amount.get(t.id) ?? emptyResources()
      return { teamId: t.id, name: t.name, color: t.color, gem: r.gem, gold: r.gold }
    })
    const results: GameResults = { rule, teams: rankTeams(teams, rule), publishedAt: new Date().toISOString() }
    updateGame('results = ?', [JSON.stringify(results)])
    return results
  })()
}

/**
 * 리셋: 처음부터 다시. 반환: 지운 계정 id (접속 중인 소켓을 끊는다)
 * - 참가자 전원과 진행자(고정 관리자 외 admin)를 삭제. refresh token·투표는 FK CASCADE 로 함께 지워진다
 * - 진행 기록(재화 이력·투표·거래·라이프)과 알림(공지 포함 모든 종류)을 비운다. events id 는 AUTOINCREMENT 라 재사용되지 않아 클라이언트 replay 가 꼬이지 않는다
 * - 시드 테스트 계정을 고정 PIN 으로 다시 만든다 (팀·리더 미리 배정)
 * - 팀 정의·룰 문서·설정값(최대 인원·초기 재화·매장량·테스트 계정 포함)은 유지. 총 일수만 비운다
 */
export function resetGame(): number[] {
  return db.transaction(() => {
    const removed = (db.prepare(`SELECT id FROM users WHERE role = 'member' OR (role = 'admin' AND is_fixed = 0)`).all() as { id: number }[]).map((r) => r.id)
    clearTrades()
    clearElections()
    clearLifeSubmissions()
    clearLedger()
    db.prepare('DELETE FROM events').run()
    if (removed.length) db.prepare(`DELETE FROM users WHERE id IN (${removed.map(() => '?').join(',')})`).run(...removed)
    createSeedUsers(TEST_USERS)
    resetAmountsToInitial()
    updateGame(`status = 'setup', total_days = NULL, day = 0, phase = NULL, life_reserve = life_reserve_initial, aid_used = 0,
                results = NULL, started_at = NULL, ended_at = NULL`)
    applyTestAccounts(getGameRow().include_test === 1)
    return removed
  })()
}

/** 생산 활동 라이프 지급: 매장량에서 차감 (음수 delta 는 매장량으로 반환) */
export function takeFromLifeReserve(delta: number) {
  const g = getGameRow()
  if (delta > g.life_reserve) throw new GameError('reserve_exhausted', `라이프 매장량이 부족합니다 (남은 ${g.life_reserve})`)
  updateGame('life_reserve = life_reserve - ?', [delta])
}

/** 원조는 게임 전체 1회. 조건부 갱신으로 동시에 눌러도 한 번만 */
export function markAidUsed() {
  const ok = db.prepare('UPDATE game SET aid_used = 1 WHERE id = 1 AND aid_used = 0').run().changes === 1
  if (!ok) throw new GameError('aid_used', '원조는 게임 전체에서 1회만 가능합니다')
}

/** 팀별 활성 인원 */
export function activeMemberCount(teamId: number): number {
  return listGroupMembers(teamId).length
}
