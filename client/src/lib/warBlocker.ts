import { josa, RESOURCE_LABELS, WAR_COST_KINDS, type PublicWarState, type Resources } from '../../../shared/game'

/** 전쟁을 선포할 수 없는 이유. 선포할 수 있으면 빈 문자열 */
export function warBlocker(war: PublicWarState | null | undefined, resources: Resources | null | undefined): string {
  if (war?.allowed === false) return '이번 라운드는 리더 협의로 전쟁이 금지되었습니다.'
  if (war?.active) return '전쟁이 진행 중입니다.'
  if (war?.usedToday) return '이번 라운드에는 이미 전쟁이 선포되었습니다 (라운드당 1회).'
  const cost = war?.cost
  if (!cost) return '이번 라운드 선포 비용이 정해지지 않았습니다.'
  const short = resources ? WAR_COST_KINDS.filter((k) => resources[k] < cost[k]) : []
  if (short.length) return `${josa(short.map((k) => RESOURCE_LABELS[k]).join(', '), '이/가')} 부족해 선포할 수 없습니다.`
  return ''
}

/** 선포 비용 문구 ("보석 100, 크레딧 2"). 정해지지 않았으면 '-' */
export function warCostText(war: PublicWarState | null | undefined): string {
  const c = war?.cost
  if (!c) return '-'
  return WAR_COST_KINDS.filter((k) => c[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${c[k]}`).join(', ') || '없음 (무료)'
}
