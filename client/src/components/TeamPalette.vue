<script setup lang="ts">
/** 팀 색 선택 팔레트 (shared/teams.ts TEAM_PALETTE). 서버도 이 목록의 값만 받는다 */
import { TEAM_PALETTE, isLightColor } from '../../../shared/teams'

defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [hex: string] }>()
</script>

<template>
  <span class="palette" role="radiogroup" aria-label="팀 색">
    <button
      v-for="c in TEAM_PALETTE"
      :key="c.hex"
      type="button"
      class="swatch"
      :class="{ selected: c.hex === modelValue, light: isLightColor(c.hex) }"
      :style="{ '--team': c.hex }"
      :title="c.name"
      :aria-label="c.name"
      :aria-checked="c.hex === modelValue"
      role="radio"
      @click="emit('update:modelValue', c.hex)"
    />
  </span>
</template>

<style scoped>
.palette { display: inline-flex; gap: 5px; flex-wrap: wrap; vertical-align: middle; }
.swatch {
  width: 20px; height: 20px; padding: 0; min-width: 0;
  border-radius: 50%;
  background: var(--team);
  border: 1px solid var(--line);
  cursor: pointer;
}
.swatch.light { border-color: var(--line-strong); }
.swatch.selected { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink); }
</style>
