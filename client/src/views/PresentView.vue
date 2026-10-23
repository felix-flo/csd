<script setup lang="ts">
/**
 * 프레젠테이션 (빔 출력). 준비 상태에서는 팀 입장 현황(A 3/5 …, 실제 팀 이름 비공개)과 접속 QR. 게임 중에는 일차·단계와 모든 팀 초기 재화 합계만 공개한다 (이후 변동은 비공개).
 * 모든 팀 리더 선출 / 라이프 제출 완료는 큰 알림으로, 게임 종료 후에는 발표된 등수를 보여준다.
 * 게임 시작 후에는 팀 현황(팀별 팀원 명단, 리더, 탈락자 흐리게)도 보여준다. 재화는 공개하지 않는다.
 * 명단은 게임 상태가 갱신될 때마다(단계 전환, 팀 구성 변경 신호 lobby) 다시 받는다.
 * 제목: 시작 전에는 "스위칭데이"만. 게임 제목은 서버가 시작 후에만 보내고(state.title), 시작 순간 열려 있던 화면은 리졸브 효과로 공개한다.
 *       시작 후 새로 열거나 새로고침하면 효과 없이 바로 제목.
 */
import { computed, onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import AccessQr from '../components/AccessQr.vue'
import ResourceRow from '../components/ResourceRow.vue'
import ResultsBoard from '../components/ResultsBoard.vue'
import TeamMark from '../components/TeamMark.vue'
import ResolveText from '../components/ResolveText.vue'
import { useGameStore } from '../stores/game'
import { api } from '../lib/api'
import { isBeforeStart, type RosterTeam } from '../../../shared/game'

const game = useGameStore()
onMounted(() => void game.load())
const s = computed(() => game.state)

const PRE_TITLE = '스위칭데이'
// 상태를 받기 전(새로고침 직후)에는 비워 둔다 — 시작 후 새로고침에서 "스위칭데이" 가 잠깐 보이지 않게
const title = computed(() => (s.value ? s.value.title ?? PRE_TITLE : ''))
/** 시작 순간(시작 전 → 진행) 실시간으로 받았을 때만 올린다 → ResolveText 재생 */
const reveal = ref(0)
const revealing = ref(false)
watch(() => s.value?.status, (now, before) => {
  if (before && isBeforeStart(before) && now && !isBeforeStart(now)) {
    revealing.value = true
    reveal.value++
  }
})

const roster = ref<RosterTeam[]>([])
async function loadRoster() {
  if (!s.value || isBeforeStart(s.value.status)) {
    roster.value = []
    return
  }
  try {
    roster.value = (await api.get<{ teams: RosterTeam[] }>('/api/game/roster')).teams
  } catch { /* 다음 갱신 때 다시 */ }
}
watch(s, loadRoster, { immediate: true })
const alive = (t: RosterTeam) => t.members.filter((m) => !m.eliminated).length
</script>

<template>
  <div class="page" style="max-width: 1100px">
    <TopBar :title="title" large>
      <template #title><ResolveText :text="title" :play="reveal" @done="revealing = false" /></template>
      <template #subtitle>
        <!-- v-if 로 비우면 TopBar 기본값(내 이름)이 나오므로 span 은 항상 둔다 -->
        <span class="subtitle" :class="{ hidden: revealing }">{{ s?.title ? 'for Switching Day' : '' }}</span>
      </template>
    </TopBar>
    <ResultsBoard v-if="s?.status === 'ended' && s.results" :results="s.results" large />
    <div v-if="s?.status === 'running' && (s.phase === 'leader' && s.leadersDone || s.phase === 'life' && s.livesDone)" class="card done-banner">
      {{ s.phase === 'leader' ? '모든팀의 리더 선출이 완료되었습니다.' : '모든 팀의 라이프가 제출되었습니다.' }}
    </div>
    <div class="present-grid">
      <div v-if="s?.status === 'ready' && s.lobby" class="card">
        <h2>팀 입장 현황</h2>
        <div class="lobby">
          <div v-for="t in s.lobby" :key="t.teamId" class="lobby-team" :class="{ full: t.count >= t.capacity }">
            <span class="letter">{{ t.label }}</span>
            <span class="mono">{{ t.count }} / {{ t.capacity }}</span>
          </div>
        </div>
        <p class="muted" style="margin: 12px 0 0">QR 로 접속해 PIN 으로 로그인한 뒤 이름을 입력하고 팀을 고르세요.</p>
      </div>
      <div v-else class="card">
        <h2>초기 재화 <span class="muted">모든 팀 합계</span></h2>
        <ResourceRow large show-label :amounts="s?.initialTotals" />
        <p class="muted" style="margin: 12px 0 0">게임 시작 시점의 전체 재화입니다. 이후 변동은 공개하지 않습니다.</p>
      </div>
      <div class="card">
        <h2>접속 주소</h2>
        <AccessQr />
      </div>
    </div>
    <div v-if="roster.length" class="card">
      <h2>팀 현황</h2>
      <div class="roster">
        <div v-for="t in roster" :key="t.teamId" class="roster-team" :style="{ '--team': t.color }">
          <div class="roster-head">
            <span class="name"><TeamMark :color="t.color" size="lg" />{{ t.name }}</span>
            <span class="mono count">{{ alive(t) }} / {{ t.members.length }}</span>
          </div>
          <ul>
            <li v-for="(m, i) in t.members" :key="i" :class="{ out: m.eliminated }">
              {{ m.name }} <span v-if="m.isLeader" class="badge on">리더</span><span v-if="m.eliminated" class="muted"> 탈락</span>
            </li>
            <li v-if="t.members.length === 0" class="muted">팀원 없음</li>
          </ul>
        </div>
      </div>
    </div>
    <EventFeed />
  </div>
</template>

<style scoped>
.present-grid { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; }
@media (max-width: 720px) { .present-grid { grid-template-columns: 1fr; } }
.lobby { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.lobby-team { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 1.4rem; }
.lobby-team.full { opacity: 0.4; }
.lobby-team .letter { font-family: var(--font-display); font-size: 3.4rem; line-height: 1; }
/* 제목 공개 중에는 즉시 숨기고(transition 없음), 공개가 끝나면 천천히 나타난다 */
.subtitle { transition: opacity 0.8s ease; }
.subtitle.hidden { opacity: 0; transition: none; }
.roster { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.roster-team { border: 1px solid var(--line); border-top: 4px solid var(--team, var(--line)); border-radius: var(--radius); padding: 12px 14px; }
.roster-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.roster-head .name { font-family: var(--font-display); font-size: 1.6rem; }
.roster-head .count { font-size: 1.2rem; }
.roster-team ul { list-style: none; margin: 0; padding: 0; font-size: 1.15rem; }
.roster-team li { padding: 4px 0; border-top: 1px solid var(--line-soft); }
.roster-team li.out { opacity: 0.45; text-decoration: line-through; }
.done-banner { font-family: var(--font-display); font-size: 2.4rem; line-height: 1.2; border-left: 3px solid var(--blue); }
</style>
