/**
 * 재화 표시 정의. 수량/거래 로직은 룰 확정 후 추가하고, 여기서는 표시(이모지·색·순서)만 고정한다.
 * 순서와 색: 보석=화이트, 골드=옐로우, 라이프=블루, 크레딧=레드.
 * 이모지는 기기마다 색이 달라서(💎 는 대부분 하늘색) 칩 배경색을 재화 색으로 고정하고,
 * 보석 이모지는 CSS 로 흑백 처리해 "흰 보석" 으로 보이게 한다 (style.css .res.gem).
 * 골드는 🥇 (모든 플랫폼에서 금색. 🪙 는 Apple 에서 은색이라 제외).
 */
export type ResourceKey = 'gem' | 'gold' | 'life' | 'credit'

export interface ResourceDef {
  key: ResourceKey
  label: string
  emoji: string
  /** 보조 설명 (방송 기준 역할) */
  hint: string
}

export const RESOURCES: readonly ResourceDef[] = [
  { key: 'gem', label: '보석', emoji: '💎', hint: '상금' },
  { key: 'gold', label: '골드', emoji: '🥇', hint: '상금 결정' },
  { key: 'life', label: '라이프', emoji: '💙', hint: '생명' },
  { key: 'credit', label: '크레딧', emoji: '🎟️', hint: '기회' },
] as const

export const RESOURCE_BY_KEY: Record<ResourceKey, ResourceDef> = Object.fromEntries(
  RESOURCES.map((r) => [r.key, r]),
) as Record<ResourceKey, ResourceDef>
