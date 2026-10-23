<script setup lang="ts">
/**
 * 게임 진행 표시줄. 모든 역할의 상단바 아래에 붙는다 (TopBar).
 * "2일차 / 총 5일 · 거래 활동 중" + 하루 흐름 5단계 중 현재 위치.
 */
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { PHASE_LABELS, PHASES } from '../../../shared/game'

defineProps<{ large?: boolean }>()
const game = useGameStore()
const s = computed(() => game.state)
</script>

<template>
  <div v-if="s && s.status !== 'setup'" class="phase-bar" :class="{ large, ended: s.status === 'ended' }">
    <template v-if="s.status === 'running' && s.phase">
      <div class="now">
        <span class="day mono">{{ s.day }}일차 <span class="muted">/ 총 {{ s.totalDays }}일</span></span>
        <strong>{{ PHASE_LABELS[s.phase] }} 중</strong>
      </div>
      <ol class="steps">
        <li v-for="(p, i) in PHASES" :key="p" :class="{ cur: p === s.phase, past: PHASES.indexOf(s.phase) > i }">
          {{ PHASE_LABELS[p] }}
        </li>
      </ol>
    </template>
    <div v-else class="now"><strong>게임 종료</strong><span v-if="!s.results" class="muted">등수 발표 대기 중</span></div>
  </div>
</template>

<style scoped>
.phase-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 14px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-left: 3px solid var(--blue);
  border-radius: var(--radius);
}
.phase-bar.ended { border-left-color: var(--ink); }
.now { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.now strong { font-size: 1.1rem; }
.day { font-size: 0.85rem; }
.steps { display: flex; gap: 4px; list-style: none; margin: 0; padding: 0; flex-wrap: wrap; }
.steps li {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
}
.steps li.past { color: var(--line-strong); border-color: var(--line-soft); }
.steps li.cur { color: #fff; background: var(--blue); border-color: var(--blue); }
.large .now strong { font-size: 2rem; }
.large .day { font-size: 1.2rem; }
.large .steps li { font-size: 0.95rem; padding: 4px 12px; }
</style>
