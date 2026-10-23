/**
 * 거래 (리더 ↔ 리더). 흐름:
 *   requested ──수락──▶ awaiting_credit ──크레딧 제출(먼저 낸 팀 1개)──▶ negotiating ──양쪽 제안 + 양쪽 수락──▶ completed
 *       └─거부─▶ rejected                └─취소─▶ cancelled                    └─취소─▶ cancelled
 *
 * 동시성:
 * - 요청~종료까지 시스템 전체에 1건만. idx_trades_one_active (partial unique index) 가 DB 수준에서 보장하므로
 *   두 팀이 동시에 요청해도 하나만 들어가고 나머지는 trade_busy.
 * - 모든 상태 전이는 `UPDATE … WHERE id = ? AND status = <기대 상태>` 로 하고 changes 를 확인한다.
 *   크레딧은 두 팀이 동시에 눌러도 조건부 UPDATE 에 먼저 성공한 팀만 1개 차감되고, 나머지는 credit_already_paid.
 * - 제안을 바꾸면 양쪽 수락이 초기화된다. 완료 시 보유량을 다시 검사하고 부족하면 전체 롤백.
 * - better-sqlite3 는 동기 + Node 단일 스레드라 한 요청의 트랜잭션은 다른 요청과 섞이지 않는다. 위 조건부 갱신은 그 위의 이중 안전장치.
 *
 * 제재(대가 없는 제재: 특정 팀의 다음날 하루 거래 금지)는 아직 구현하지 않는다.
 * 추가할 때는 trade_sanctions(day, group_id) 테이블을 두고 requestTrade() 에서 from/to 팀이 그 날 제재 중이면 거부하면 된다.
 */
import { db } from './index.js'
import { findGroupById, listGroupMembers } from './users.js'
import { applyDeltas, getTeamResources, negate } from './resources.js'
import { GameError } from './gameError.js'
import { ACTIVE_TRADE_STATUSES, isResources, RESOURCE_KINDS } from '../../../shared/game.js'
import type { Resources, TradeStatus, TradeView } from '../../../shared/game.js'

interface TradeRow {
  id: number
  day: number
  from_group: number
  to_group: number
  status: TradeStatus
  credit_payer: number | null
  from_offer: string | null
  to_offer: string | null
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
    from: { teamId: r.from_group, offer: r.from_offer ? JSON.parse(r.from_offer) : null, accepted: r.from_accepted === 1 },
    to: { teamId: r.to_group, offer: r.to_offer ? JSON.parse(r.to_offer) : null, accepted: r.to_accepted === 1 },
    creditPayer: r.credit_payer,
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

export function requestTrade(day: number, fromTeam: number, toTeam: number, by: number): TradeView {
  return db.transaction(() => {
    if (fromTeam === toTeam) throw new GameError('same_team', '', 400)
    if (!findGroupById(toTeam)) throw new GameError('not_found', '', 404)
    if (!listGroupMembers(toTeam).some((m) => m.isLeader)) throw new GameError('no_leader', '상대 팀에 리더가 없습니다')
    // 전쟁 선포부터 결과가 나올 때까지 모든 팀 거래 금지 (war.ts 가 이 모듈을 쓰므로 직접 조회)
    if (db.prepare(`SELECT 1 FROM wars WHERE status = 'declared'`).get()) throw new GameError('war_active', '전쟁 중에는 거래할 수 없습니다')
    const active = getActiveTrade()
    if (active) {
      const mine = active.from.teamId === fromTeam || active.to.teamId === fromTeam
      throw new GameError(mine ? 'already_trading' : 'trade_busy', mine ? '이미 진행 중인 거래가 있습니다' : '다른 팀이 거래중입니다')
    }
    try {
      const info = db
        .prepare(`INSERT INTO trades (day, from_group, to_group, status, created_by) VALUES (?, ?, ?, 'requested', ?)`)
        .run(day, fromTeam, toTeam, by)
      return getTrade(Number(info.lastInsertRowid))!
    } catch (e) {
      if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') throw new GameError('trade_busy', '다른 팀이 거래중입니다')
      throw e
    }
  })()
}

/** 요청받은 팀이 수락/거부 */
export function respondTrade(id: number, teamId: number, accept: boolean): TradeView {
  return db.transaction(() => {
    const t = requireRow(id)
    if (t.to_group !== teamId) throw new GameError('not_party', '요청받은 팀만 응답할 수 있습니다', 403)
    const ok = accept
      ? transition(id, ['requested'], `status = 'awaiting_credit'`)
      : transition(id, ['requested'], `status = 'rejected', closed_by = ?`, [teamId])
    if (!ok) throw new GameError('stale', '이미 처리된 요청입니다')
    return getTrade(id)!
  })()
}

/** 크레딧 제출: 두 팀 중 먼저 낸 팀만 1개 소모 */
export function payCredit(id: number, teamId: number, day: number, by: number): TradeView {
  return db.transaction(() => {
    const t = requireRow(id)
    sideOf(t, teamId)
    if (!transition(id, ['awaiting_credit'], `status = 'negotiating', credit_payer = ?`, [teamId])) {
      const now = getRow(id)
      throw new GameError(now?.status === 'negotiating' ? 'credit_already_paid' : 'stale', now?.status === 'negotiating' ? '상대 팀이 먼저 크레딧을 제출했습니다' : '')
    }
    applyDeltas(teamId, { credit: -1 }, { reason: 'trade_credit', day, refId: id, by }) // 부족하면 전이까지 롤백
    return getTrade(id)!
  })()
}

/** 제안 (다시 제안하면 양쪽 수락 초기화). 보유량 이하만 */
export function proposeOffer(id: number, teamId: number, offer: Resources): TradeView {
  return db.transaction(() => {
    if (!isResources(offer) || RESOURCE_KINDS.some((k) => offer[k] < 0)) throw new GameError('bad_offer', '', 400)
    const t = requireRow(id)
    const side = sideOf(t, teamId)
    if (t.status !== 'negotiating') throw new GameError('stale', '제안할 수 없는 상태입니다')
    const own = getTeamResources(teamId)
    const short = RESOURCE_KINDS.find((k) => offer[k] > own[k])
    if (short) throw new GameError('insufficient', '보유량보다 많이 제안할 수 없습니다')
    if (!transition(id, ['negotiating'], `${side}_offer = ?, from_accepted = 0, to_accepted = 0`, [JSON.stringify(offer)])) {
      throw new GameError('stale', '')
    }
    return getTrade(id)!
  })()
}

/** 수락. 양쪽 모두 수락하면 재화를 맞바꾸고 completed. 반환 completed=true 면 방금 완료됨 */
export function acceptOffer(id: number, teamId: number, day: number, by: number): { trade: TradeView; completed: boolean } {
  return db.transaction(() => {
    const t = requireRow(id)
    const side = sideOf(t, teamId)
    if (t.status !== 'negotiating') throw new GameError('stale', '수락할 수 없는 상태입니다')
    if (!t.from_offer || !t.to_offer) throw new GameError('not_proposed', '양쪽 모두 제안해야 수락할 수 있습니다')
    if (!transition(id, ['negotiating'], `${side}_accepted = 1`)) throw new GameError('stale', '')
    const now = getRow(id)!
    if (!(now.from_accepted && now.to_accepted)) return { trade: toView(now), completed: false }
    // 양쪽 수락 → 완료. 조건부 전이로 한 번만 실행
    if (!transition(id, ['negotiating'], `status = 'completed'`)) throw new GameError('stale', '')
    const fromOffer = JSON.parse(now.from_offer!) as Resources
    const toOffer = JSON.parse(now.to_offer!) as Resources
    const opts = { reason: 'trade' as const, day, refId: id, by }
    applyDeltas(now.from_group, negate(fromOffer), opts)
    applyDeltas(now.to_group, fromOffer, opts)
    applyDeltas(now.to_group, negate(toOffer), opts)
    applyDeltas(now.from_group, toOffer, opts)
    return { trade: getTrade(id)!, completed: true }
  })()
}

/** 당사자 취소 (teamId) 또는 관리자·단계 전환에 의한 강제 취소 (teamId=null). 크레딧은 환불하지 않는다 */
export function cancelTrade(id: number, teamId: number | null): TradeView {
  return db.transaction(() => {
    const t = requireRow(id)
    if (teamId != null) sideOf(t, teamId)
    if (!transition(id, [...ACTIVE_TRADE_STATUSES], `status = 'cancelled', closed_by = ?`, [teamId])) {
      throw new GameError('stale', '이미 끝난 거래입니다')
    }
    return getTrade(id)!
  })()
}

/** 진행 중 거래가 있으면 강제 취소하고 반환 */
export function cancelActiveTrade(): TradeView | null {
  const t = getActiveTrade()
  return t ? cancelTrade(t.id, null) : null
}

export function clearTrades() {
  db.prepare('DELETE FROM trades').run()
}
