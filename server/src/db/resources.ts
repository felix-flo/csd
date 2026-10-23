/**
 * 팀 재화 (team_resources) + 변동 이력 (resource_ledger).
 * - 모든 변동은 applyDeltas() 로만 한다. 0 미만이 되면 GameError('insufficient') 로 거부하고, 호출자의 트랜잭션 전체가 롤백된다.
 * - initial 은 게임 설정의 초기값. 게임 시작·리셋 때 amount 를 initial 로 맞춘다.
 */
import { db } from './index.js'
import { listGroups } from './users.js'
import { GameError } from './gameError.js'
import { emptyResources, RESOURCE_KINDS, RESOURCE_LABELS } from '../../../shared/game.js'
import type { LedgerEntry, LedgerReason, ResourceKind, Resources } from '../../../shared/game.js'

/** 팀 × 재화 행이 없으면 0 으로 만든다 (팀이 나중에 추가돼도 동작하도록 조회 전에 호출) */
export function ensureResourceRows() {
  const insert = db.prepare('INSERT OR IGNORE INTO team_resources (group_id, kind) VALUES (?, ?)')
  for (const g of listGroups()) for (const k of RESOURCE_KINDS) insert.run(g.id, k)
}

function rowsToMap(rows: { group_id: number; kind: ResourceKind; v: number }[]): Map<number, Resources> {
  const map = new Map<number, Resources>()
  for (const r of rows) {
    if (!map.has(r.group_id)) map.set(r.group_id, emptyResources())
    map.get(r.group_id)![r.kind] = r.v
  }
  return map
}

export function getTeamResources(teamId: number): Resources {
  ensureResourceRows()
  const rows = db.prepare('SELECT group_id, kind, amount AS v FROM team_resources WHERE group_id = ?').all(teamId) as {
    group_id: number; kind: ResourceKind; v: number
  }[]
  return rowsToMap(rows).get(teamId) ?? emptyResources()
}

/** 전 팀 현재 보유량 / 초기값 */
export function getAllResources(): { amount: Map<number, Resources>; initial: Map<number, Resources> } {
  ensureResourceRows()
  const amount = db.prepare('SELECT group_id, kind, amount AS v FROM team_resources').all() as never[]
  const initial = db.prepare('SELECT group_id, kind, initial AS v FROM team_resources').all() as never[]
  return { amount: rowsToMap(amount), initial: rowsToMap(initial) }
}

export function setInitialResources(teamId: number, values: Resources) {
  ensureResourceRows()
  const update = db.prepare('UPDATE team_resources SET initial = ? WHERE group_id = ? AND kind = ?')
  for (const k of RESOURCE_KINDS) update.run(values[k], teamId, k)
}

/** 보유량을 초기값으로 되돌린다 (게임 시작·리셋) */
export function resetAmountsToInitial() {
  ensureResourceRows()
  db.prepare('UPDATE team_resources SET amount = initial').run()
}

export interface DeltaOptions {
  reason: LedgerReason
  day: number
  refId?: number | null
  by?: number | null
}

/**
 * 재화 증감. 0 인 항목은 건너뛴다. 하나라도 0 미만이 되면 GameError('insufficient').
 * 반드시 db.transaction 안에서 호출해야 실패 시 앞선 변경이 함께 롤백된다.
 */
export function applyDeltas(teamId: number, deltas: Partial<Resources>, opts: DeltaOptions): Resources {
  ensureResourceRows()
  const current = getTeamResources(teamId)
  const update = db.prepare('UPDATE team_resources SET amount = ? WHERE group_id = ? AND kind = ?')
  const ledger = db.prepare(
    `INSERT INTO resource_ledger (group_id, kind, delta, amount_after, reason, ref_id, day, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const k of RESOURCE_KINDS) {
    const d = deltas[k] ?? 0
    if (d === 0) continue
    const next = current[k] + d
    if (next < 0) throw new GameError('insufficient', `${RESOURCE_LABELS[k]} 부족 (보유 ${current[k]}, 필요 ${-d})`)
    update.run(next, teamId, k)
    ledger.run(teamId, k, d, next, opts.reason, opts.refId ?? null, opts.day, opts.by ?? null)
    current[k] = next
  }
  return current
}

/** 게임 시작 시 초기값을 이력에 남긴다 (0 은 생략) */
export function recordInitialLedger(day: number, by: number) {
  const { initial } = getAllResources()
  const ledger = db.prepare(
    `INSERT INTO resource_ledger (group_id, kind, delta, amount_after, reason, day, created_by) VALUES (?, ?, ?, ?, 'init', ?, ?)`,
  )
  for (const [teamId, r] of initial) for (const k of RESOURCE_KINDS) if (r[k] > 0) ledger.run(teamId, k, r[k], r[k], day, by)
}

export function clearLedger() {
  db.prepare('DELETE FROM resource_ledger').run()
}

export function listLedger(limit = 50): LedgerEntry[] {
  const rows = db
    .prepare('SELECT id, group_id, kind, delta, amount_after, reason, day, created_at FROM resource_ledger ORDER BY id DESC LIMIT ?')
    .all(limit) as {
      id: number; group_id: number; kind: ResourceKind; delta: number; amount_after: number; reason: LedgerReason; day: number; created_at: string
    }[]
  return rows.map((r) => ({
    id: r.id,
    teamId: r.group_id,
    kind: r.kind,
    delta: r.delta,
    amountAfter: r.amount_after,
    reason: r.reason,
    day: r.day,
    createdAt: r.created_at,
  }))
}

/** "보석 +3, 라이프 -1" */
export function describeDeltas(deltas: Partial<Resources>): string {
  return RESOURCE_KINDS.filter((k) => (deltas[k] ?? 0) !== 0)
    .map((k) => `${RESOURCE_LABELS[k]} ${deltas[k]! > 0 ? '+' : ''}${deltas[k]}`)
    .join(', ')
}

export function negate(r: Partial<Resources>): Partial<Resources> {
  const out: Partial<Resources> = {}
  for (const k of RESOURCE_KINDS) if (r[k]) out[k] = -r[k]!
  return out
}
