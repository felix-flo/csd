<script setup lang="ts">
/** 단계 여러 개 고르기 (마지막 라운드 발행 허용 단계, docs/100 D4). 항상 PHASES 순서로 내보낸다 */
import { PHASE_LABELS, PHASES, sortPhases, type Phase } from '../../../shared/game'

const model = defineModel<Phase[]>({ required: true })
defineProps<{ disabled?: boolean }>()

function toggle(p: Phase, on: boolean) {
  model.value = sortPhases(on ? [...model.value, p] : model.value.filter((x) => x !== p))
}
</script>

<template>
  <span class="row" style="gap: 10px">
    <label v-for="p in PHASES" :key="p" class="row" style="gap: 4px">
      <input type="checkbox" :checked="model.includes(p)" :disabled="disabled" @change="toggle(p, ($event.target as HTMLInputElement).checked)" />
      {{ PHASE_LABELS[p] }}
    </label>
  </span>
</template>
