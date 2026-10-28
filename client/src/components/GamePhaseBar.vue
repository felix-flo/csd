<script setup lang="ts">
/**
 * 게임 진행 표시줄. 모든 역할의 상단바 아래에 붙는다 (TopBar).
 * "2라운드 / 총 6라운드 · 거래 중" + 라운드 흐름 5단계 중 현재 위치. 준비 상태에서는 "게임 준비 중".
 * 전쟁 중(선포~결과)에는 아래에 "⚔️ 전쟁 중: 공격팀 → 방어팀 · 모든 거래 중지" 띠를 붙인다.
 */
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import { PHASE_LABELS, PHASES } from '../../../shared/game'

defineProps<{ large?: boolean }>()
const game = useGameStore()
const s = computed(() => game.state)
const teams = useTeamsStore()
const war = computed(() => (s.value?.status === 'running' ? s.value.war?.active ?? null : null))
const nameOf = (id: number) => teams.byId(id)?.name ?? `#${id}`
</script>

<template>
  <div v-if="s && s.status !== 'setup'" class="phase-bar" :class="{ large, ended: s.status === 'ended', ready: s.status === 'ready' }">
    <template v-if="s.status === 'running' && s.phase">
      <div class="now">
        <span class="day mono">{{ s.day }}라운드 <span class="muted">/ 총 {{ s.totalDays }}라운드</span></span>
        <strong>{{ PHASE_LABELS[s.phase] }} 중</strong>
      </div>
      <ol class="steps">
        <li v-for="(p, i) in PHASES" :key="p" :class="{ cur: p === s.phase, past: PHASES.indexOf(s.phase) > i }">
          {{ PHASE_LABELS[p] }}
        </li>
      </ol>
    </template>
    <div v-else-if="s.status === 'ready'" class="now"><strong>게임 준비 중</strong><span class="muted">참가자 입장·팀 선택</span></div>
    <div v-else class="now"><strong>게임 종료</strong><span v-if="!s.results" class="muted">등수 발표 대기 중</span></div>
  </div>
  <div v-if="war" class="war-bar" :class="{ large }" role="status">
    ⚔️ <strong>전쟁 중: {{ nameOf(war.attacker) }} → {{ nameOf(war.defender) }}</strong>
    <span>· 결과가 나올 때까지 모든 거래 중지</span>
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
.war-bar { margin: -6px 0 14px; padding: 10px 12px; border: 2px solid var(--red); border-left-width: 6px; border-radius: var(--radius); background: var(--red-bg); color: var(--red); }
.war-bar strong { font-size: 1.1rem; }
.war-bar.large strong { font-size: 1.8rem; }
.phase-bar.ended { border-left-color: var(--ink); }
.phase-bar.ready { border-left-color: var(--line-strong); }
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
