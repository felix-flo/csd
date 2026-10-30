<script setup lang="ts">
/**
 * 프레젠테이션 (빔 출력). 준비 상태에서는 팀 입장 현황(A 3/5 …, 실제 팀 이름 비공개)과 접속 QR. 게임 중에는 일차·단계와 모든 팀 초기 재화 합계만 공개한다 (이후 변동은 비공개).
 * 모든 팀 리더 선출 / 라이프 제출 완료는 큰 알림으로. 최종장(docs/100 N2)에는 투표 인원 현황 → 득표 → 상금 화폐·마지막 라운드 발행량 → 정산을 크게 보여준다.
 * 게임 시작 후에는 팀 현황(팀별 팀원 명단, 리더, 탈락자 흐리게)도 보여준다. 재화는 공개하지 않는다.
 * 현황판 (docs/100 D5): 골드 발행 누적(마지막 라운드 전까지)과 오늘 전쟁 선포 비용·전쟁 상태. 보석 발행량은 공개하지 않는다.
 * 명단은 게임 상태가 갱신될 때마다(단계 전환, 팀 구성 변경 신호 lobby) 다시 받는다.
 * 제목: 시작 전에는 "스위칭데이"만. 게임 제목은 서버가 시작 후에만 보내고(state.title), 시작 순간 열려 있던 화면은 리졸브 효과로 공개한다.
 *       시작 후 새로 열거나 새로고침하면 효과 없이 바로 제목.
 * 오프닝 영상: 서버 data/media/intro.mp4 가 있으면 시작 순간 전체 화면으로 먼저 틀고, 끝난 뒤 제목 리졸브로 이어진다 (IntroVideo).
 *       소리는 이 탭에서 한 번 클릭이 있어야 나므로 시작 전에 "영상 준비" 안내를 보여 준다.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import AccessQr from '../components/AccessQr.vue'
import ResourceRow from '../components/ResourceRow.vue'
import ResultsBoard from '../components/ResultsBoard.vue'
import TeamMark from '../components/TeamMark.vue'
import ResolveText from '../components/ResolveText.vue'
import IntroVideo from '../components/IntroVideo.vue'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import { api } from '../lib/api'
import { isBeforeStart, RESOURCE_LABELS, WAR_COST_KINDS, WAR_STATUS_LABELS, type IntroResponse, type RosterTeam, type WarCost } from '../../../shared/game'

const game = useGameStore()
onMounted(() => void game.load())
const s = computed(() => game.state)

const PRE_TITLE = '스위칭데이'
// 상태를 받기 전(새로고침 직후)에는 비워 둔다 — 시작 후 새로고침에서 "스위칭데이" 가 잠깐 보이지 않게
const title = computed(() => (s.value ? s.value.title ?? PRE_TITLE : ''))
/** 시작 순간(시작 전 → 진행) 실시간으로 받았을 때만 올린다 → ResolveText 재생 */
const reveal = ref(0)
const revealing = ref(false)
/** 오프닝 영상 (있을 때만). 시작 순간 영상 → 끝나면 제목 리졸브 */
const intro = ref<string | null>(null)
const introPlay = ref(0)
/** 이 탭에서 사용자 입력이 있었는지 — 없으면 영상 소리가 막히므로 안내를 보여 준다 */
const armed = ref(false)
function arm() { armed.value = true }
onMounted(async () => {
  window.addEventListener('pointerdown', arm, { once: true })
  window.addEventListener('keydown', arm, { once: true })
  try { intro.value = (await api.get<IntroResponse>('/api/game/intro')).url } catch { /* 없음으로 둔다 */ }
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', arm)
  window.removeEventListener('keydown', arm)
})
function startReveal() {
  revealing.value = true
  reveal.value++
}
watch(() => s.value?.status, (now, before) => {
  if (before && isBeforeStart(before) && now && !isBeforeStart(now)) {
    if (intro.value) introPlay.value++
    else startReveal()
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

// ---- 현황판: 골드 발행 누적 · 전쟁 (docs/100 D5) ----
const teams = useTeamsStore()
const nameOf = (id: number) => teams.byId(id)?.name ?? `#${id}`
const isLastRound = computed(() => !!s.value && s.value.status === 'running' && s.value.day >= (s.value.totalDays ?? 0))
const final = computed(() => (s.value?.status === 'final' || s.value?.status === 'ended' ? s.value.final : null))
/** 마지막 라운드 발행은 최종장 결과 발표 전까지 비공개 */
const lastHidden = computed(() => isLastRound.value || (!!final.value && !final.value.lastIssue))
const costText = (c: WarCost) => WAR_COST_KINDS.filter((k) => c[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${c[k]}`).join(', ') || '없음 (무료)'
/** 전쟁 줄: 선포 전 비용 → 전쟁 중 → 오늘 결과 */
const warLine = computed(() => {
  const w = s.value?.war
  if (!w || s.value?.status !== 'running') return null
  const pair = w.today ? `${nameOf(w.today.attacker)} → ${nameOf(w.today.defender)}` : ''
  if (w.today?.status === 'declared') return { text: `전쟁 중: ${pair}`, hot: true }
  if (w.today) return { text: `이번 라운드 전쟁: ${pair} · ${WAR_STATUS_LABELS[w.today.status]}`, hot: false }
  return { text: w.cost ? `이번 라운드 선포 비용: ${costText(w.cost)}` : '이번 라운드 선포 비용 미정', hot: false }
})
</script>

<template>
  <div class="page" style="max-width: 1100px">
    <IntroVideo :src="intro" :play="introPlay" @done="startReveal" />
    <TopBar :title="title" large>
      <template #title><ResolveText :text="title" :play="reveal" @done="revealing = false" /></template>
      <template #subtitle>
        <!-- v-if 로 비우면 TopBar 기본값(내 이름)이 나오므로 span 은 항상 둔다 -->
        <span class="subtitle" :class="{ hidden: revealing }">{{ s?.title ? 'for Switching Day' : '' }}</span>
      </template>
    </TopBar>
    <ResultsBoard v-if="final" :final="final" :results="s?.results ?? null" large />
    <div v-if="final && final.step === 'vote' && !final.closed" class="card done-banner">
      🗳️ 최종 투표 중 · <span class="mono">{{ final.votes.done }} / {{ final.votes.eligible }}</span>명
      <span v-if="s?.lifeVote" class="muted sub">라이프 투표권 사용 가능</span>
    </div>
    <div v-if="s?.status === 'running' && (s.phase === 'leader' && s.leadersDone || s.phase === 'life' && s.livesDone)" class="card done-banner">
      {{ s.phase === 'leader' ? '모든팀의 리더 선출이 완료되었습니다.' : '모든 팀의 라이프가 제출되었습니다.' }}
    </div>
    <div class="present-grid">
      <div v-if="s?.status === 'ready' && s.lobby" class="card span2">
        <h2>팀 입장 현황</h2>
        <div class="lobby">
          <div v-for="t in s.lobby" :key="t.teamId" class="lobby-team" :class="{ full: t.count >= t.capacity }">
            <span class="letter">{{ t.label }}</span>
            <span class="mono">{{ t.count }} / {{ t.capacity }}</span>
          </div>
        </div>
        <p class="muted" style="margin: 12px 0 0">QR 로 접속해 PIN 으로 로그인한 뒤 이름을 입력하고 팀을 고르세요.</p>
        <p v-if="intro" class="intro-note" :class="{ ok: armed }">
          🎬 게임 시작 때 오프닝 영상을 틉니다.
          <template v-if="armed">소리 재생 준비됨.</template>
          <template v-else>소리를 내려면 이 화면을 한 번 클릭해 두세요. <button class="secondary" style="padding: 4px 12px; font-size: 0.9rem" @click="arm">영상 준비</button></template>
        </p>
      </div>
      <div v-else class="card" :class="{ span2: !s || isBeforeStart(s.status) }">
        <h2>초기 재화 <span class="muted">모든 팀 합계</span></h2>
        <ResourceRow large show-label :amounts="s?.initialTotals" />
        <p class="muted" style="margin: 12px 0 0">게임 시작 시점의 전체 재화입니다. 이후 변동은 공개하지 않습니다.</p>
      </div>
      <div v-if="s && !isBeforeStart(s.status)" class="card board">
        <h2>현황판</h2>
        <p class="gold">🥇 골드 발행 누적 <strong class="mono">{{ s.goldIssued ?? 0 }}</strong>개</p>
        <p v-if="lastHidden" class="muted">마지막 라운드 발행은 최종장 결과 발표 때 공개됩니다.</p>
        <p v-if="warLine" class="war" :class="{ hot: warLine.hot }">⚔️ {{ warLine.text }}</p>
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
/* 초기 재화 · 현황판 · QR. 준비 상태는 입장 현황이 두 칸을 차지한다 */
.present-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: start; }
.present-grid .span2 { grid-column: span 2; }
@media (max-width: 900px) { .present-grid { grid-template-columns: 1fr; } .present-grid .span2 { grid-column: auto; } }
.lobby { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.lobby-team { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); font-size: 1.4rem; }
.lobby-team.full { opacity: 0.4; }
.lobby-team .letter { font-family: var(--font-display); font-size: 3.4rem; line-height: 1; }
/* 오프닝 영상 안내: 클릭 전에는 눈에 띄게, 준비되면 흐리게 */
.intro-note { margin: 12px 0 0; font-size: 1.05rem; color: var(--blue); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.intro-note.ok { color: var(--muted); }
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
.board .gold { margin: 0; font-size: 1.3rem; }
.board .gold strong { font-size: 2rem; }
.board .war { margin: 10px 0 0; font-size: 1.15rem; }
.board .war.hot { color: var(--red); font-weight: 700; font-size: 1.4rem; }
.done-banner .sub { font-size: 1.2rem; margin-left: 8px; }
.done-banner { font-family: var(--font-display); font-size: 2.4rem; line-height: 1.2; border-left: 3px solid var(--blue); }
</style>
