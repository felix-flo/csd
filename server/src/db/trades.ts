/**
 * 거래: 두 팀이 오프라인에서 협의하고 진행자에게 오면 진행자가 입력해서 바로 끝낸다.
 * 입력 한 번이 한 트랜잭션이다. 크레딧 1개(내는 팀) 차감 + 재화 교환. 보유량이 모자라면 전체를 되돌린다.
 */
import { db } from './index.js'
import { findGroupById } from './users.js'
import { applyDeltas, getTeamResources, negate } from './resources.js'
import { GameError } from './gameError.js'
import { isResources, RESOURCE_KINDS, RESOURCE_LABELS } from '../../../shared/game.js'
import type { Resources, TradeView } from '../../../shared/game.js'

interface TradeRow {
  id: number
  day: number
  from_group: number
  to_group: number
  status: string
  credit_payer: number
  from_offer: string
  to_offer: string
  updated_at: string
}

function toView(r: TradeRow): TradeView {
  return {
    id: r.id,
    day: r.day,
    from: { teamId: r.from_group, offer: JSON.parse(r.from_offer) as Resources },
    to: { teamId: r.to_group, offer: JSON.parse(r.to_offer) as Resources },
    creditPayer: r.credit_payer,
    updatedAt: r.updated_at,
  }
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

/** 진행자 입력. 두 팀 모두 리더가 있어야 하고, 각 팀이 줄 재화(+수수료)는 보유량 이하여야 한다 */
export function executeTrade(day: number, p: TradeProposal, by: number, teamName: (id: number) => string): TradeView {
  return db.transaction(() => {
    if (p.fromTeam === p.toTeam) throw new GameError('same_team', '같은 팀끼리는 거래할 수 없습니다', 400)
    if (!findGroupById(p.fromTeam) || !findGroupById(p.toTeam)) throw new GameError('not_found', '', 404)
    if (p.creditPayer !== p.fromTeam && p.creditPayer !== p.toTeam) throw new GameError('bad_payer', '크레딧은 거래하는 두 팀 중 한 팀이 냅니다', 400)
    if (!isResources(p.fromOffer) || !isResources(p.toOffer) || RESOURCE_KINDS.some((k) => p.fromOffer[k] < 0 || p.toOffer[k] < 0)) throw new GameError('bad_offer', '수량이 잘못되었습니다', 400)
    if (RESOURCE_KINDS.every((k) => p.fromOffer[k] === 0 && p.toOffer[k] === 0)) throw new GameError('bad_offer', '교환할 재화를 입력하세요', 400)
    // 전쟁이 나면 그 라운드 거래는 끝 (war.ts 가 이 모듈을 쓰므로 직접 조회)
    if (db.prepare('SELECT 1 FROM wars WHERE day = ?').get(day)) throw new GameError('war_active', '전쟁으로 이번 라운드 거래가 종료되었습니다')
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
    return toView(db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as TradeRow)
  })()
}

export function clearTrades() {
  db.prepare('DELETE FROM trades').run()
}
