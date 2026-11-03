<script setup lang="ts">
/** 재화 4종을 정해진 순서(보석·골드·라이프·크레딧)로 한 줄에 표시 */
import { RESOURCES, type ResourceKey } from '../lib/resources'
import ResourceChip from './ResourceChip.vue'

defineProps<{ amounts?: Partial<Record<ResourceKey, number | null>>; large?: boolean; showLabel?: boolean; grid?: boolean; animated?: boolean }>()
</script>

<template>
  <div class="row res-row" :class="{ grid }">
    <ResourceChip v-for="r in RESOURCES" :key="r.key" :kind="r.key" :amount="amounts?.[r.key]" :large="large" :show-label="showLabel || grid" :animated="animated" />
  </div>
</template>

<style scoped>
.res-row { gap: 10px; }
/* 휴대폰 팀 재화: 2×2 칸, 숫자를 크게 */
.res-row.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
.res-row.grid :deep(.res) { display: grid; grid-template-columns: auto 1fr; gap: 2px 6px; padding: 12px 14px; background: none; border-radius: 0; font-size: 1rem; color: var(--ink); }
.res-row.grid :deep(.res .res-label) { font-size: 0.87rem; color: var(--muted); }
.res-row.grid :deep(.res-amount) { grid-column: 1 / 3; font-size: 1.9rem; font-weight: 650; letter-spacing: -0.03em; line-height: 1.15; }
.res-row.grid :deep(.res:nth-child(odd)) { border-right: 1px solid var(--line-soft); }
.res-row.grid :deep(.res:nth-child(-n + 2)) { border-bottom: 1px solid var(--line-soft); }
</style>
