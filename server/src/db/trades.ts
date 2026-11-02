/**
 * 거래 (docs/103 §10: 오프라인 협의 → 진행자 입력 → 즉시 체결). 흐름:
 *   진행자 "거래 진행" (확인 팝업) ──▶ completed (크레딧 1개 차감 + 재화 교환)
 *   2026-11-02 변경: 두 리더 수락 단계를 없앴다. proposed/rejected 와 from/to_accepted 는 옛 기록용
 *   (proposed 로 남은 옛 거래는 관리자 강제 취소 · 거래 단계 종료 · 전쟁 선포 때 cancelled 로 정리된다)
 *
 * 동시성:
 * - 한 트랜잭션 안에서 보유량을 검사하고 바로 교환한다. 부족하면 applyDeltas 가 던져 전체 롤백.
 * - better-sqlite3 는 동기 + Node 단일 스레드라 한 요청의 트랜잭션은 다른 요청과 섞이지 않는다.
 */
import { db } from './index.js'
import { findGroupById } from './users.js'
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

function requireRow(id: number): TradeRow {
  const r = getRow(id)
  if (!r) throw new GameError('not_found', '', 404)
  return r
}

function requireAffordable(teamId: number, offer: Resources, needCredit: boolean, label: string) {
  const own = getTeamResources(teamId)
  const need = { ...offer, credit: offer.credit + (needCredit ? 1 : 0) }
  const short = RESOURCE_KINDS.find((k) => need[k] > own[k])
  if (short) throw new GameError('insufficient', `${label}의 ${RESOURCE_LABELS[short]}이(가) 부족해요 (필요 ${need[short]}, 보유 ${own[short]})`)
}

export interface TradeProposal {
  fromTeam: number
  toTeam: number
  creditPayer: number
  fromOffer: Resources
  toOffer: Resources
}

/** 진행자 거래 체결. 각 팀이 줄 재화(+수수료)는 보유량 이하여야 하고, 통과하면 크레딧 1개(내는 팀) 차감 + 재화 교환 */
export function executeTrade(day: number, p: TradeProposal, by: number, teamName: (id: number) => string): TradeView {
  return db.transaction(() => {
    if (p.fromTeam === p.toTeam) throw new GameError('same_team', '같은 팀끼리는 거래할 수 없어요', 400)
    if (!findGroupById(p.fromTeam) || !findGroupById(p.toTeam)) throw new GameError('not_found', '', 404)
    if (p.creditPayer !== p.fromTeam && p.creditPayer !== p.toTeam) throw new GameError('bad_payer', '크레딧은 거래하는 두 팀 중 한 팀이 내요', 400)
    if (!isResources(p.fromOffer) || !isResources(p.toOffer) || RESOURCE_KINDS.some((k) => p.fromOffer[k] < 0 || p.toOffer[k] < 0)) throw new GameError('bad_offer', '', 400)
    if (RESOURCE_KINDS.every((k) => p.fromOffer[k] === 0 && p.toOffer[k] === 0)) throw new GameError('bad_offer', '교환할 재화를 입력하세요', 400)
    // 전쟁 중(선포~결과)에는 모든 거래 금지 (war.ts 가 이 모듈을 쓰므로 직접 조회)
    if (db.prepare(`SELECT 1 FROM wars WHERE status = 'declared' LIMIT 1`).get()) throw new GameError('war_active', '전쟁 중에는 거래할 수 없어요')
    requireAffordable(p.fromTeam, p.fromOffer, p.creditPayer === p.fromTeam, teamName(p.fromTeam))
    requireAffordable(p.toTeam, p.toOffer, p.creditPayer === p.toTeam, teamName(p.toTeam))
    const id = Number(db
      .prepare(`INSERT INTO trades (day, from_group, to_group, status, credit_payer, from_offer, to_offer, from_accepted, to_accepted, created_by)
                VALUES (?, ?, ?, 'completed', ?, ?, ?, 1, 1, ?)`)
      .run(day, p.fromTeam, p.toTeam, p.creditPayer, JSON.stringify(p.fromOffer), JSON.stringify(p.toOffer), by).lastInsertRowid)
    applyDeltas(p.creditPayer, { credit: -1 }, { reason: 'trade_credit', day, refId: id, by })
    const opts = { reason: 'trade' as const, day, refId: id, by }
    applyDeltas(p.fromTeam, negate(p.fromOffer), opts)
    applyDeltas(p.toTeam, p.fromOffer, opts)
    applyDeltas(p.toTeam, negate(p.toOffer), opts)
    applyDeltas(p.fromTeam, p.toOffer, opts)
    return getTrade(id)!
  })()
}

/** 관리자·단계 전환·전쟁 선포에 의한 강제 취소 */
export function cancelTrade(id: number): TradeView {
  return db.transaction(() => {
    requireRow(id)
    if (!transition(id, [...ACTIVE_TRADE_STATUSES], `status = 'cancelled', closed_by = NULL`)) {
      throw new GameError('stale', '이미 끝난 거래예요')
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
