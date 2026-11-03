<script setup lang="ts">
/** 콤보박스 대신 팀을 나열해서 고른다 (생산, 정정, 거래, 원조) */
import { teamInk } from '../lib/teamColor'
import TeamMark from './TeamMark.vue'

defineProps<{ teams: { id: number; name: string; color: string }[]; modelValue: number | null | undefined; disabledId?: number | null; doneIds?: Set<number> }>()
defineEmits<{ 'update:modelValue': [id: number] }>()
</script>

<template>
  <div class="team-picker" role="group">
    <button
      v-for="t in teams"
      :key="t.id"
      type="button"
      :aria-pressed="modelValue === t.id"
      :disabled="disabledId === t.id"
      :style="{ '--team': teamInk(t.color) ?? t.color }"
      @click="$emit('update:modelValue', t.id)"
    >
      <TeamMark :color="t.color" />{{ t.name.replace(/ 팀$/, '') }}<span v-if="doneIds?.has(t.id)" class="done" title="이번 라운드 입력함"> ✓</span>
    </button>
  </div>
</template>

<style scoped>
.team-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(58px, 1fr)); gap: 4px; flex: 1 1 240px; min-width: 0; }
button { background: var(--surface); color: var(--ink-2); box-shadow: inset 0 0 0 1px var(--line); min-height: 36px; padding: 4px 6px; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button:hover { background: var(--bg-soft); }
button[aria-pressed='true'] { background: var(--blue-bg); color: var(--ink); font-weight: 700; box-shadow: inset 0 0 0 2px var(--ink); }
button:disabled:hover { background: var(--surface); }
button :deep(.team-mark) { margin-right: 4px; }
.done { color: var(--muted); font-weight: 700; }
</style>
