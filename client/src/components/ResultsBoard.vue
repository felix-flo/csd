<script setup lang="ts">
/** 최종 등수 (관리자가 발표한 결과). 프레젠테이션에서는 큰 글씨 */
import { computed } from 'vue'
import type { GameResults } from '../../../shared/game'
import TeamMark from './TeamMark.vue'

const props = defineProps<{ results: GameResults; large?: boolean }>()
const ruleText = computed(() => {
  const r = props.results.rule
  if (r.mode === 'gem') return '보석 수'
  if (r.mode === 'gold') return '골드 수'
  return `보석 × ${r.gem} + 골드 × ${r.gold}`
})
</script>

<template>
  <div class="card results" :class="{ large }">
    <h2>최종 등수</h2>
    <p class="muted">점수 = {{ ruleText }}</p>
    <ol class="ranks">
      <li v-for="t in results.teams" :key="t.teamId" :class="{ first: t.rank === 1 }">
        <span class="rank mono">{{ t.rank }}위</span>
        <span class="team"><TeamMark :color="t.color" :size="large ? 'lg' : undefined" />{{ t.name }}</span>
        <span class="detail mono">💎 {{ t.gem }} · 🥇 {{ t.gold }}</span>
        <span class="score mono">{{ t.score.toLocaleString('ko-KR') }}점</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.ranks { list-style: none; padding: 0; margin: 0; }
.ranks li {
  display: grid;
  grid-template-columns: 4em 1fr auto auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--line-soft);
}
.ranks li:last-child { border-bottom: none; }
.ranks li.first .team { font-weight: 700; }
.rank { color: var(--muted); }
.first .rank { color: var(--blue); font-weight: 700; }
.detail { color: var(--muted); font-size: 0.85rem; }
.score { font-weight: 700; }
.large h2 { font-size: 2.4rem; }
.large .ranks li { font-size: 1.8rem; padding: 16px 0; grid-template-columns: 5em 1fr auto auto; }
.large .detail { font-size: 1.1rem; }
@media (max-width: 560px) { .ranks li { grid-template-columns: 3.5em 1fr auto; } .detail { display: none; } }
</style>
