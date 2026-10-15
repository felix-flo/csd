import type { GameEvent } from '../../../shared/types'

const roleNames: Record<string, string> = { member: '참가자 전원', presenter: '프레젠테이션', admin: '진행자' }

/** 이벤트 범위 문구: 전체 / 역할 · 참가자 전원 / 그룹 · B 그룹 / 개인 · 홍길동 */
export function scopeLabel(ev: GameEvent): string {
  switch (ev.scope) {
    case 'all': return '전체'
    case 'role': return `역할 · ${roleNames[ev.targetRole ?? ''] ?? ev.targetRole ?? ''}`
    case 'group': return `그룹 · ${ev.targetName ?? `#${ev.targetId}`}`
    case 'user': return `개인 · ${ev.targetName ?? `#${ev.targetId}`}`
    default: return ev.scope
  }
}

/** 이벤트 본문 문구 */
export function eventMessage(ev: GameEvent): string {
  const m = ev.payload.message
  return typeof m === 'string' ? m : JSON.stringify(ev.payload)
}
