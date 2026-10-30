/**
 * 거래 (2026-10-30 docs/103 §10: 오프라인 협의 → 진행자 입력 → 두 리더 수락). 흐름:
 *   진행자 "거래 진행" ──▶ proposed ──두 리더 모두 수락──▶ completed (크레딧 1개 차감 + 재화 교환)
 *                              ├─한쪽 리더 거부──▶ rejected
 *                              └─관리자 강제 취소 · 거래 단계 종료 · 전쟁 선포──▶ cancelled
 *
 * 동시성:
 * - 제안~종료까지 시스템 전체에 1건만. idx_trades_one_active (partial unique index) 가 DB 수준에서 보장한다.
 * - 모든 상태 전이는 `UPDATE … WHERE id = ? AND status = <기대 상태>` 로 하고 changes 를 확인한다.
 * - 두 리더가 동시에 수락해도 완료 전이는 조건부 UPDATE 로 한 번만 실행된다. 완료 시 보유량을 다시 검사하고 부족하면 전체 롤백.
 * - better-sqlite3 는 동기 + Node 단일 스레드라 한 요청의 트랜잭션은 다른 요청과 섞이지 않는다.
 */
import { db } from './index.js'
import { findGroupById, listGroupMembers } from './users.js'
import { applyDeltas, getTeamResources, negate } from './resources.js'
import { GameError } from './gameError.js'
import { ACTIVE_TRADE_STATUSES, isResources, RESOURCE_KINDS, RESOURCE_LABELS } from '../../../shared/game.js'
import type { Resources, TradeStatus, TradeView } from '../../../shared/game.js'

interface TradeRow {
  id: number
  day: number
  from_group: number
  to_group: number
  status: TradeStatus
  credit_payer: number
  from_offer: string
  to_offer: string
  from_accepted: number
  to_accepted: number
  closed_by: number | null
  updated_at: string
}

const ACTIVE_SQL = `status IN (${ACTIVE_TRADE_STATUSES.map((s) => `'${s}'`).join(', ')})`

function toView(r: TradeRow): TradeView {
  return {
    id: r.id,
    day: r.day,
    status: r.status,
    from: { teamId: r.from_group, offer: JSON.parse(r.from_offer) as Resources, accepted: r.from_accepted === 1 },
    to: { teamId: r.to_group, offer: JSON.parse(r.to_offer) as Resources, accepted: r.to_accepted === 1 },
    creditPayer: r.credit_payer,
    closedBy: r.closed_by,
    updatedAt: r.updated_at,
  }
}

function getRow(id: number): TradeRow | undefined {
  return db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as TradeRow | undefined
}

export function getTrade(id: number): TradeView | null {
  const r = getRow(id)
  return r ? toView(r) : null
}

export function getActiveTrade(): TradeView | null {
  const r = db.prepare(`SELECT * FROM trades WHERE ${ACTIVE_SQL} LIMIT 1`).get() as TradeRow | undefined
  return r ? toView(r) : null
}

/** 내 팀이 참여한 진행 중 거래 */
export function getActiveTradeForTeam(teamId: number): TradeView | null {
  const t = getActiveTrade()
  return t && (t.from.teamId === teamId || t.to.teamId === teamId) ? t : null
}

/** 활성 상태일 때만 상태 전이. 실패하면 다른 요청이 먼저 바꾼 것 */
function transition(id: number, from: TradeStatus[], set: string, params: unknown[] = []): boolean {
  const marks = from.map(() => '?').join(', ')
  return (
    db.prepare(`UPDATE trades SET ${set}, updated_at = datetime('now') WHERE id = ? AND status IN (${marks})`).run(...params, id, ...from).changes === 1
  )
}

function sideOf(t: TradeRow, teamId: number): 'from' | 'to' {
  if (t.from_group === teamId) return 'from'
  if (t.to_group === teamId) return 'to'
  throw new GameError('not_party', '거래 당사자가 아닙니다', 403)
}

function requireRow(id: number): TradeRow {
  const r = getRow(id)
  if (!r) throw new GameError('not_found', '', 404)
  return r
}

function requireAffordable(teamId: number, offer: Resources, needCredit: boolean, label: string) {
  const own = getTeamResources(teamId)
  const need = { ...offer, credit: offer.credit + (needCredit ? 1 : 0) }
  const short = RESOURCE_KINDS.find((k) => need[k] > own[k])
  if (short) throw new GameError('insufficient', `${label}의 ${RESOURCE_LABELS[short]}이(가) 부족합니다 (필요 ${need[short]}, 보유 ${own[short]})`)
}

export interface TradeProposal {
  fromTeam: number
  toTeam: number
  creditPayer: number
  fromOffer: Resources
  toOffer: Resources
}

/** 진행자 제안. 두 팀 모두 리더가 있어야 하고, 각 팀이 줄 재화(+수수료)는 보유량 이하여야 한다 */
export function proposeTrade(day: number, p: TradeProposal, by: number, teamName: (id: number) => string): TradeView {
  return db.transaction(() => {
    if (p.fromTeam === p.toTeam) throw new GameError('same_team', '같은 팀끼리는 거래할 수 없습니다', 400)
    if (!findGroupById(p.fromTeam) || !findGroupById(p.toTeam)) throw new GameError('not_found', '', 404)
    if (p.creditPayer !== p.fromTeam && p.creditPayer !== p.toTeam) throw new GameError('bad_payer', '크레딧은 거래하는 두 팀 중 한 팀이 냅니다', 400)
    if (!isResources(p.fromOffer) || !isResources(p.toOffer) || RESOURCE_KINDS.some((k) => p.fromOffer[k] < 0 || p.toOffer[k] < 0)) throw new GameError('bad_offer', '', 400)
    if (RESOURCE_KINDS.every((k) => p.fromOffer[k] === 0 && p.toOffer[k] === 0)) throw new GameError('bad_offer', '교환할 재화를 입력하세요', 400)
    for (const id of [p.fromTeam, p.toTeam]) {
      if (!listGroupMembers(id).some((m) => m.isLeader)) throw new GameError('no_leader', `${teamName(id)}에 리더가 없습니다`)
    }
    // 전쟁 중(선포~결과)에는 모든 거래 금지 (war.ts 가 이 모듈을 쓰므로 직접 조회)
    if (db.prepare(`SELECT 1 FROM wars WHERE status = 'declared' LIMIT 1`).get()) throw new GameError('war_active', '전쟁 중에는 거래할 수 없습니다')
    if (getActiveTrade()) throw new GameError('trade_busy', '진행 중인 거래가 있습니다. 끝나거나 취소된 뒤 올리세요')
    requireAffordable(p.fromTeam, p.fromOffer, p.creditPayer === p.fromTeam, teamName(p.fromTeam))
    requireAffordable(p.toTeam, p.toOffer, p.creditPayer === p.toTeam, teamName(p.toTeam))
    try {
      const info = db
        .prepare(`INSERT INTO trades (day, from_group, to_group, status, credit_payer, from_offer, to_offer, created_by) VALUES (?, ?, ?, 'proposed', ?, ?, ?, ?)`)
        .run(day, p.fromTeam, p.toTeam, p.creditPayer, JSON.stringify(p.fromOffer), JSON.stringify(p.toOffer), by)
      return getTrade(Number(info.lastInsertRowid))!
    } catch (e) {
      if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') throw new GameError('trade_busy', '진행 중인 거래가 있습니다')
      throw e
    }
  })()
}

/**
 * 리더 수락/거부. 양쪽 모두 수락하면 크레딧 1개(내는 팀) 차감 + 재화 교환 → completed.
 * 반환 completed=true 면 방금 완료됨. 거부하면 rejected (closed_by = 거부한 팀)
 */
export function decideTrade(id: number, teamId: number, accept: boolean, day: number, by: number): { trade: TradeView; completed: boolean } {
  return db.transaction(() => {
    const t = requireRow(id)
    const side = sideOf(t, teamId)
    if (t.status !== 'proposed') throw new GameError('stale', '이미 끝난 거래입니다')
    if (!accept) {
      if (!transition(id, ['proposed'], `status = 'rejected', closed_by = ?`, [teamId])) throw new GameError('stale', '이미 끝난 거래입니다')
      return { trade: getTrade(id)!, completed: false }
    }
    if ((side === 'from' ? t.from_accepted : t.to_accepted) === 1) throw new GameError('already_accepted', '이미 수락했습니다')
    if (!transition(id, ['proposed'], `${side}_accepted = 1`)) throw new GameError('stale', '이미 끝난 거래입니다')
    const now = getRow(id)!
    if (!(now.from_accepted && now.to_accepted)) return { trade: toView(now), completed: false }
    // 양쪽 수락 → 완료. 조건부 전이로 한 번만 실행. 재화가 부족하면 applyDeltas 가 던져 전체 롤백
    if (!transition(id, ['proposed'], `status = 'completed'`)) throw new GameError('stale', '')
    const fromOffer = JSON.parse(now.from_offer) as Resources
    const toOffer = JSON.parse(now.to_offer) as Resources
    applyDeltas(now.credit_payer, { credit: -1 }, { reason: 'trade_credit', day, refId: id, by })
    const opts = { reason: 'trade' as const, day, refId: id, by }
    applyDeltas(now.from_group, negate(fromOffer), opts)
    applyDeltas(now.to_group, fromOffer, opts)
    applyDeltas(now.to_group, negate(toOffer), opts)
    applyDeltas(now.from_group, toOffer, opts)
    return { trade: getTrade(id)!, completed: true }
  })()
}

/** 관리자·단계 전환·전쟁 선포에 의한 강제 취소 */
export function cancelTrade(id: number): TradeView {
  return db.transaction(() => {
    requireRow(id)
    if (!transition(id, [...ACTIVE_TRADE_STATUSES], `status = 'cancelled', closed_by = NULL`)) {
      throw new GameError('stale', '이미 끝난 거래입니다')
    }
    return getTrade(id)!
  })()
}

/** 진행 중 거래가 있으면 강제 취소하고 반환 */
export function cancelActiveTrade(): TradeView | null {
  const t = getActiveTrade()
  return t ? cancelTrade(t.id) : null
}

export function clearTrades() {
  db.prepare('DELETE FROM trades').run()
}
