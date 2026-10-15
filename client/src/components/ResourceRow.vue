<script setup lang="ts">
/** 재화 4종을 정해진 순서(보석·골드·라이프·크레딧)로 한 줄에 표시 */
import { RESOURCES, type ResourceKey } from '../lib/resources'
import ResourceChip from './ResourceChip.vue'

defineProps<{ amounts?: Partial<Record<ResourceKey, number | null>>; large?: boolean; showLabel?: boolean }>()
</script>

<template>
  <div class="row res-row">
    <ResourceChip v-for="r in RESOURCES" :key="r.key" :kind="r.key" :amount="amounts?.[r.key]" :large="large" :show-label="showLabel" />
  </div>
</template>

<style scoped>
.res-row { gap: 10px; }
</style>
