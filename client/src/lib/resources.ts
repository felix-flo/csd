/**
 * 재화 표시 정의 (라벨·설명·순서). 종류 목록은 shared/game.ts RESOURCE_KINDS 와 같다.
 * 순서와 색: 보석=화이트, 골드=옐로우, 라이프=블루, 크레딧=레드. 아이콘은 Icon.vue (name = key), 색은 style.css --res-*-fg.
 * (이모지는 기기마다 모양·색이 달라 2026-11-01 docs/106 에서 SVG 아이콘으로 바꿨다)
 */
import type { ResourceKind } from '../../../shared/game'

export type ResourceKey = ResourceKind

export interface ResourceDef {
  key: ResourceKey
  label: string
  /** 보조 설명 (방송 기준 역할) */
  hint: string
}

export const RESOURCES: readonly ResourceDef[] = [
  { key: 'gem', label: '보석', hint: '상금' },
  { key: 'gold', label: '골드', hint: '상금 결정' },
  { key: 'life', label: '라이프', hint: '생명' },
  { key: 'credit', label: '크레딧', hint: '기회' },
] as const

export const RESOURCE_BY_KEY: Record<ResourceKey, ResourceDef> = Object.fromEntries(
  RESOURCES.map((r) => [r.key, r]),
) as Record<ResourceKey, ResourceDef>
