/**
 * 게임 전역 상태 (game 테이블 1행) 와 진행 제어.
 * - setup  : 관리자가 총 일수·테스트 계정 포함·라이프 매장량·팀별 초기 재화를 설정
 * - running: day 1..totalDays, phase 는 PHASES 순서. 관리자 "다음 단계" 로만 넘어간다. 라이프 제출 다음은 +1일 리더 선출
 * - ended  : 마지막 날에 관리자가 종료. 환산 규칙을 골라 등수를 발표한다
 * - reset  : 시작 시점 스냅샷(팀 구성·리더·활성)으로 참가자를 되돌리고, 재화를 초기값으로, 진행 기록(이력·투표·거래·라이프)을 비운다.
 *            총 일수는 비워서 다시 설정하게 한다. 초기 재화·매장량·테스트 계정 설정은 유지
 */
import { db } from './index.js'
import { listGroupMembers, listGroups, setUsersActive } from './users.js'
import { ensureLeader } from './teams.js'
import {
  clearLedger, getAllResources, recordInitialLedger, resetAmountsToInitial, setInitialResources,
} from './resources.js'
import { allElectionsDone, clearElections, finalizeElection, openElections, type FinalizeResult } from './election.js'
import { cancelActiveTrade, clearTrades } from './trades.js'
import { allLivesDone, clearLifeSubmissions } from './life.js'
import { GameError } from './gameError.js'
import { emptyResources, PHASES, rankTeams, sumResources } from '../../../shared/game.js'
import type { GameResults, GameSettings, GameState, GameStatus, Phase, Resources, ScoreRule, TradeView } from '../../../shared/game.js'

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
  }
}

export function getSettings(): GameSettings {
  const g = getGameRow()
  const { initial } = getAllResources()
  return {
    totalDays: g.total_days,
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

/** 설정 저장 (setup 에서만). 반환: 비활성으로 바뀐 테스트 계정 id */
export function saveSettings(input: { totalDays: number | null; includeTest: boolean; lifeReserve: number; initial: Record<string, Resources> }): number[] {
  return db.transaction(() => {
    if (getGameRow().status !== 'setup') throw new GameError('not_setup', '게임 설정은 시작 전에만 바꿀 수 있습니다')
    const teamIds = new Set(listGroups().map((t) => t.id))
    for (const [key, r] of Object.entries(input.initial)) {
      if (!teamIds.has(Number(key))) throw new GameError('unknown_team', key, 400)
      setInitialResources(Number(key), r)
    }
    resetAmountsToInitial()
    updateGame('total_days = ?, include_test = ?, life_reserve_initial = ?, life_reserve = ?', [
      input.totalDays, input.includeTest ? 1 : 0, input.lifeReserve, input.lifeReserve,
    ])
    return applyTestAccounts(input.includeTest)
  })()
}

export function startGame(by: number): number[] {
  return db.transaction(() => {
    const g = getGameRow()
    if (g.status !== 'setup') throw new GameError('not_setup', '이미 시작된 게임입니다')
    if (!g.total_days) throw new GameError('no_days', '총 일수를 먼저 설정하세요')
    const deactivated = applyTestAccounts(g.include_test === 1)
    // 시작 시점 참가자 상태 스냅샷 (리셋용)
    db.prepare('DELETE FROM game_snapshot').run()
    db.prepare(`INSERT INTO game_snapshot (user_id, group_id, is_leader, active) SELECT id, group_id, is_leader, active FROM users WHERE role = 'member'`).run()
    clearLedger()
    clearElections()
    clearTrades()
    clearLifeSubmissions()
    resetAmountsToInitial()
    recordInitialLedger(1, by)
    updateGame(`status = 'running', day = 1, phase = 'leader', life_reserve = life_reserve_initial, aid_used = 0, results = NULL,
                started_at = datetime('now'), ended_at = NULL`)
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
 * 리셋. 반환: 스냅샷 복원으로 비활성이 된 참가자 id (세션 종료용)
 */
export function resetGame(): number[] {
  return db.transaction(() => {
    const snapshot = db.prepare('SELECT user_id, group_id, is_leader, active FROM game_snapshot').all() as {
      user_id: number; group_id: number | null; is_leader: number; active: number
    }[]
    const teamIds = new Set(listGroups().map((t) => t.id))
    const wasActive = new Set((db.prepare(`SELECT id FROM users WHERE role = 'member' AND active = 1`).all() as { id: number }[]).map((r) => r.id))
    const restore = db.prepare('UPDATE users SET group_id = ?, is_leader = ?, active = ? WHERE id = ?')
    const deactivated: number[] = []
    for (const s of snapshot) {
      // 시작 후 삭제된 팀이면 현재 팀을 유지
      const groupId = s.group_id != null && teamIds.has(s.group_id)
        ? s.group_id
        : (db.prepare('SELECT group_id FROM users WHERE id = ?').get(s.user_id) as { group_id: number | null }).group_id
      restore.run(groupId, s.is_leader, s.active, s.user_id)
      if (s.active === 0 && wasActive.has(s.user_id)) deactivated.push(s.user_id)
    }
    db.prepare('DELETE FROM game_snapshot').run()
    clearTrades()
    clearElections()
    clearLifeSubmissions()
    clearLedger()
    resetAmountsToInitial()
    updateGame(`status = 'setup', total_days = NULL, day = 0, phase = NULL, life_reserve = life_reserve_initial, aid_used = 0,
                results = NULL, started_at = NULL, ended_at = NULL`)
    for (const t of listGroups()) ensureLeader(t.id)
    db.prepare(`DELETE FROM events WHERE type IN ('game', 'trade')`).run()
    return deactivated
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
