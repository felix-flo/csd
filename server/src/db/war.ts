/**
 * 전쟁 (docs/99.전쟁.md, 2026-10-30 docs/103 §4·§12 로 승인 단계 폐지).
 *   거래 단계에서 리더가 상대 팀 선택 → 즉시 declared (비용 차감·소멸, 진행 중 거래 취소, 모든 팀 거래 금지)
 *   관리자가 오프라인 결과로 지정 → attacker_won / defender_won (패배팀 재화 4종의 절반(내림)을 승리팀이 가져감) / draw / cancelled
 *   승·패·무승부면 라우터가 거래 단계를 끝내고 리더 협의로 자동 전환한다 (취소는 거래 단계 유지)
 *
 * 규칙:
 * - 라운드(일차)에 게임 전체 1회: idx_wars_one_per_day (먼저 넣은 선포만 유효, 나중 것은 war_used)
 * - 진행 중 전쟁 1건: idx_wars_one_active. 있으면 단계 넘기기·게임 종료도 막는다 (game.ts)
 * - 선포 비용은 일차마다: 1일차는 게임 설정, 이후는 관리자가 전날 끝나기 전에 입력해야 다음 날로 넘어간다
 * - 허용/제재 (docs/103 §12): 리더 협의에서 다음 라운드 전쟁을 금지하면 war_rules(day, allowed=0). 행이 없으면 허용
 * 결과 지정은 `UPDATE … WHERE id = ? AND status = 'declared'` 로 한 번만 반영된다 (관리자 2명 동시 클릭)
 */
import { db } from './index.js'
import { findGroupById, listGroupMembers } from './users.js'
import { applyDeltas, getTeamResources, negate } from './resources.js'
import { cancelActiveTrade } from './trades.js'
import { GameError } from './gameError.js'
import { RESOURCE_LABELS, WAR_COST_KINDS, warSpoils } from '../../../shared/game.js'
import type { PublicWarState, Resources, TradeView, WarCost, WarResult, WarStatus, WarView } from '../../../shared/game.js'

interface WarRow {
  id: number
  day: number
  attacker: number
  defender: number
  status: WarStatus
  cost: string
  spoils: string | null
  created_at: string
  decided_at: string | null
}

function toView(r: WarRow): WarView {
  return {
    id: r.id,
    day: r.day,
    attacker: r.attacker,
    defender: r.defender,
    status: r.status,
    cost: JSON.parse(r.cost) as WarCost,
    spoils: r.spoils ? (JSON.parse(r.spoils) as Resources) : null,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }
}

export function getWarCost(day: number): WarCost | null {
  const r = db.prepare('SELECT gem, gold, credit FROM war_costs WHERE day = ?').get(day) as WarCost | undefined
  return r ?? null
}

export function setWarCost(day: number, cost: WarCost) {
  db.prepare(
    `INSERT INTO war_costs (day, gem, gold, credit) VALUES (?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET gem = excluded.gem, gold = excluded.gold, credit = excluded.credit`,
  ).run(day, cost.gem, cost.gold, cost.credit)
}

// ---- 허용/제재 (docs/103 §12) ----

/** 그 일차 전쟁 허용 여부. 행이 없으면 허용 */
export function isWarAllowed(day: number): boolean {
  const r = db.prepare('SELECT allowed FROM war_rules WHERE day = ?').get(day) as { allowed: number } | undefined
  return !r || r.allowed === 1
}

/** 입력했는지 (null = 미입력) */
export function getWarRule(day: number): boolean | null {
  const r = db.prepare('SELECT allowed FROM war_rules WHERE day = ?').get(day) as { allowed: number } | undefined
  return r ? r.allowed === 1 : null
}

export function setWarRule(day: number, allowed: boolean) {
  db.prepare('INSERT INTO war_rules (day, allowed) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET allowed = excluded.allowed').run(day, allowed ? 1 : 0)
}

/** 진행 중인 전쟁 (한 건). 있으면 새 선포·단계 넘기기·게임 종료 불가 */
export function getActiveWar(): WarView | null {
  const r = db.prepare(`SELECT * FROM wars WHERE status = 'declared' LIMIT 1`).get() as WarRow | undefined
  return r ? toView(r) : null
}

/** 오늘의 전쟁 기록 (라운드당 1건) */
export function getWarOfDay(day: number): WarView | null {
  const r = db.prepare(`SELECT * FROM wars WHERE day = ?`).get(day) as WarRow | undefined
  return r ? toView(r) : null
}

/** 공개 상태 */
export function getPublicWar(day: number, running: boolean): PublicWarState {
  const active = getActiveWar()
  const today = running ? getWarOfDay(day) : null
  return {
    active: active ? { id: active.id, attacker: active.attacker, defender: active.defender } : null,
    usedToday: running && !!today,
    cost: running ? getWarCost(day) : null,
    allowed: running ? isWarAllowed(day) : true,
    nextAllowed: running ? getWarRule(day + 1) : null,
    today: today ? { attacker: today.attacker, defender: today.defender, status: today.status } : null,
  }
}

/** "보석 3, 골드 2" (0 은 생략, 모두 0 이면 "없음") */
export function describeCost(cost: Partial<Resources>): string {
  return (Object.keys(RESOURCE_LABELS) as (keyof Resources)[])
    .filter((k) => (cost[k] ?? 0) > 0)
    .map((k) => `${RESOURCE_LABELS[k]} ${cost[k]}`)
    .join(', ') || '없음'
}

function requireAffordable(attacker: number, cost: WarCost) {
  const own = getTeamResources(attacker)
  const short = WAR_COST_KINDS.find((k) => own[k] < cost[k])
  if (short) throw new GameError('insufficient', `${RESOURCE_LABELS[short]}이(가) 부족합니다 (필요 ${cost[short]}, 보유 ${own[short]})`)
}

/**
 * 선포 = 즉시 전쟁 시작. 비용 차감(소멸), 진행 중 거래 취소. 라우터가 거래 단계·리더 여부를 확인한다.
 * 두 팀이 동시에 선포하면 먼저 INSERT 된 쪽만 유효 (idx_wars_one_per_day)
 */
export function declareWar(day: number, attacker: number, defender: number, by: number): { war: WarView; cancelledTrade: TradeView | null } {
  return db.transaction(() => {
    if (attacker === defender) throw new GameError('same_team', '자기 팀에는 선포할 수 없습니다', 400)
    if (!findGroupById(defender)) throw new GameError('not_found', '', 404)
    if (listGroupMembers(defender).length === 0) throw new GameError('no_members', '활성 팀원이 없는 팀입니다')
    if (!isWarAllowed(day)) throw new GameError('war_banned', '이번 라운드는 리더 협의로 전쟁이 금지되었습니다')
    if (getActiveWar()) throw new GameError('war_active', '이미 전쟁 중입니다')
    if (getWarOfDay(day)) throw new GameError('war_used', '이번 라운드에는 이미 전쟁이 선포되었습니다 (라운드당 1회)')
    const cost = getWarCost(day)
    if (!cost) throw new GameError('no_war_cost', '이번 라운드 전쟁 선포 비용이 정해지지 않았습니다')
    requireAffordable(attacker, cost)
    let id: number
    try {
      id = Number(db.prepare(`INSERT INTO wars (day, attacker, defender, status, cost, declared_by) VALUES (?, ?, ?, 'declared', ?, ?)`)
        .run(day, attacker, defender, JSON.stringify(cost), by).lastInsertRowid)
    } catch (e) {
      // 다른 팀이 먼저 선포 (라운드 1건 / 진행 중 1건 index)
      if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') throw new GameError('war_used', '다른 팀이 먼저 전쟁을 선포했습니다')
      throw e
    }
    // 비용은 소멸 (관리자에게 반납 = 게임에서 사라짐)
    applyDeltas(attacker, negate(cost), { reason: 'war_cost', day, refId: id, by })
    // 선포 시점부터 어떤 거래도 할 수 없다 → 진행 중 거래 취소
    const cancelledTrade = cancelActiveTrade()
    return { war: toView(db.prepare('SELECT * FROM wars WHERE id = ?').get(id) as WarRow), cancelledTrade }
  })()
}

export interface ResolveOutcome {
  war: WarView
  winner: number | null
  loser: number | null
  spoils: Resources | null
}

/** 관리자 결과 지정. 승패면 패배팀 재화 4종의 절반(내림)을 승리팀으로 옮긴다 */
export function resolveWar(id: number, result: WarResult, day: number, by: number): ResolveOutcome {
  return db.transaction(() => {
    const status: WarStatus =
      result === 'attacker' ? 'attacker_won' : result === 'defender' ? 'defender_won' : result === 'draw' ? 'draw' : 'cancelled'
    const ok = db
      .prepare(`UPDATE wars SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ? AND status = 'declared'`)
      .run(status, by, id).changes === 1
    if (!ok) {
      if (!db.prepare('SELECT 1 FROM wars WHERE id = ?').get(id)) throw new GameError('not_found', '', 404)
      throw new GameError('already_decided', '이미 결과가 정해진 전쟁입니다')
    }
    const war = toView(db.prepare('SELECT * FROM wars WHERE id = ?').get(id) as WarRow)
    if (result !== 'attacker' && result !== 'defender') return { war, winner: null, loser: null, spoils: null }
    const winner = result === 'attacker' ? war.attacker : war.defender
    const loser = result === 'attacker' ? war.defender : war.attacker
    const spoils = warSpoils(getTeamResources(loser))
    applyDeltas(loser, negate(spoils), { reason: 'war_loss', day, refId: id, by })
    applyDeltas(winner, spoils, { reason: 'war_spoils', day, refId: id, by })
    db.prepare('UPDATE wars SET spoils = ? WHERE id = ?').run(JSON.stringify(spoils), id)
    return { war: { ...war, spoils }, winner, loser, spoils }
  })()
}

/** 게임 시작·리셋: 전쟁 기록·허용 규칙과 2일차 이후 비용을 지운다 (1일차 비용은 게임 설정이라 남긴다) */
export function clearWars() {
  db.prepare('DELETE FROM wars').run()
  db.prepare('DELETE FROM war_rules').run()
  db.prepare('DELETE FROM war_costs WHERE day > 1').run()
}
