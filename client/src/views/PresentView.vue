<script setup lang="ts">
/**
 * 프레젠테이션 (빔 출력). 게임 중에는 일차·단계와 모든 팀 초기 재화 합계만 공개한다 (이후 변동은 비공개).
 * 모든 팀 리더 선출 / 라이프 제출 완료는 큰 알림으로, 게임 종료 후에는 발표된 등수를 보여준다.
 */
import { computed, onMounted } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import AccessQr from '../components/AccessQr.vue'
import ResourceRow from '../components/ResourceRow.vue'
import ResultsBoard from '../components/ResultsBoard.vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()
onMounted(() => void game.load())
const s = computed(() => game.state)
</script>

<template>
  <div class="page" style="max-width: 1100px">
    <TopBar title="프레젠테이션" large />
    <ResultsBoard v-if="s?.status === 'ended' && s.results" :results="s.results" large />
    <div v-if="s?.status === 'running' && (s.phase === 'leader' && s.leadersDone || s.phase === 'life' && s.livesDone)" class="card done-banner">
      {{ s.phase === 'leader' ? '모든팀의 리더 선출이 완료되었습니다.' : '모든 팀의 라이프가 제출되었습니다.' }}
    </div>
    <div class="present-grid">
      <div class="card">
        <h2>초기 재화 <span class="muted">모든 팀 합계</span></h2>
        <ResourceRow large show-label :amounts="s?.initialTotals" />
        <p class="muted" style="margin: 12px 0 0">게임 시작 시점의 전체 재화입니다. 이후 변동은 공개하지 않습니다.</p>
      </div>
      <div class="card">
        <h2>접속 주소</h2>
        <AccessQr />
      </div>
    </div>
    <EventFeed />
  </div>
</template>

<style scoped>
.present-grid { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; }
@media (max-width: 720px) { .present-grid { grid-template-columns: 1fr; } }
.done-banner { font-family: var(--font-display); font-size: 2.4rem; line-height: 1.2; border-left: 3px solid var(--blue); }
</style>
