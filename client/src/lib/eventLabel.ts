import type { GameEvent } from '../../../shared/types'

const roleNames: Record<string, string> = { member: '참가자 전원', presenter: '프레젠테이션', admin: '진행자' }

/** 이벤트 범위 문구: 전체 / 역할 · 참가자 전원 / 팀 · 블루 팀 / 개인 · 홍길동. 게임·거래 알림은 앞에 구분을 붙인다 */
export function scopeLabel(ev: GameEvent): string {
  const base = baseScopeLabel(ev)
  if (ev.type === 'trade') return `거래 · ${base}`
  if (ev.type === 'game') return `게임 · ${base}`
  return base
}

function baseScopeLabel(ev: GameEvent): string {
  switch (ev.scope) {
    case 'all': return '전체'
    case 'role': return `역할 · ${roleNames[ev.targetRole ?? ''] ?? ev.targetRole ?? ''}`
    case 'group': return `팀 · ${ev.targetName ?? `#${ev.targetId}`}`
    case 'user': return `개인 · ${ev.targetName ?? `#${ev.targetId}`}`
    default: return ev.scope
  }
}

/** 참가자 알림 머리글 (docs/107): 전체 알림 · 화이트 팀 알림 · 개인 알림 */
export function noticeLabel(ev: GameEvent): string {
  if (ev.scope === 'group') return `${ev.targetName ?? '팀'} 알림`
  if (ev.scope === 'user') return '개인 알림'
  return '전체 알림'
}

/** 알림함 구분 (docs/107): 공지 · 거래 · 전쟁 · 이주 · 발행 · 게임 */
export function inboxLabel(ev: GameEvent): string {
  if (ev.type === 'notice') return '공지'
  if (ev.type === 'trade') return '거래'
  const kind = String(ev.payload.kind ?? '')
  if (kind.startsWith('war.')) return '전쟁'
  if (kind.startsWith('migration.') || kind === 'member.moved') return '이주'
  if (kind.startsWith('issue.')) return '발행'
  return '게임'
}

/** 이벤트 본문 문구 */
export function eventMessage(ev: GameEvent): string {
  const m = ev.payload.message
  return typeof m === 'string' ? m : JSON.stringify(ev.payload)
}
