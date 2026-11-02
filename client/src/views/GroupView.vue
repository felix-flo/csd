<script setup lang="ts">
import Icon from '../components/Icon.vue'
import { computed, onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import NameSetup from '../components/NameSetup.vue'
import ResourceRow from '../components/ResourceRow.vue'
import LeaderSelect from '../components/LeaderSelect.vue'
import TradePanel from '../components/TradePanel.vue'
import LifeSubmit from '../components/LifeSubmit.vue'
import ResultsBoard from '../components/ResultsBoard.vue'
import ReadyLobby from '../components/ReadyLobby.vue'
import IssuePanel from '../components/IssuePanel.vue'
import WarPanel from '../components/WarPanel.vue'
import FinalVotePanel from '../components/FinalVotePanel.vue'
import MigrationPanel from '../components/MigrationPanel.vue'
import SpyCard from '../components/SpyCard.vue'
import IntroOverlay from '../components/IntroOverlay.vue'
import introUrl from '../assets/intro_image.webp'
import { useAuthStore } from '../stores/auth'
import { useRealtimeStore } from '../stores/realtime'
import { useGameStore } from '../stores/game'
import { api } from '../lib/api'
import type { GroupInfo, PublicUser } from '../../../shared/types'
import { isBeforeStart } from '../../../shared/game'

const auth = useAuthStore()
const rt = useRealtimeStore()
const game = useGameStore()
const group = ref<GroupInfo | null>(null)
const members = ref<PublicUser[]>([])
const s = computed(() => game.state)
// 시작 전(설정·준비)에는 게임 화면 대신 준비 화면. 실제 팀 이름도 보이지 않는다. 상태를 모르면(로딩 중) 준비 화면으로 둔다
const beforeStart = computed(() => !s.value || isBeforeStart(s.value.status))

async function load() {
  if (beforeStart.value) return
  try {
    const res = await api.get<{ group: GroupInfo; members: PublicUser[] }>('/api/group')
    group.value = res.group
    members.value = res.members
  } catch { /* 팀 없음(404) 등: 화면은 비워 둔다 */ }
}
onMounted(() => {
  void load()
  void game.load()
})
// 팀 이동·탈락·복귀·리더 선출 알림, 팀 이름·색 변경이 오면 팀원 목록을 다시 받는다 (재로그인 불필요)
watch(() => [rt.groupVersion, auth.user?.groupId], load)
// 내 팀이 바뀌면 팀 게임 정보도 다시
watch(() => auth.user?.groupId, () => game.load())

// 게임이 시작되면 팀 정보를 받는다
watch(beforeStart, (v) => {
  if (!v) void load()
})

// 시작 인트로: 대기 화면에서 시작(시작 전 → 진행)을 실시간으로 받았을 때만. 시작 후 로그인·새로고침이면 띄우지 않는다.
// 시작 순간 모두가 한꺼번에 받지 않도록 대기 화면에서 미리 받아 둔다
const intro = ref(false)
watch(() => s.value?.status, (now, before) => {
  if (before && isBeforeStart(before) && now && !isBeforeStart(now)) intro.value = true
})
watch(beforeStart, (v) => {
  if (v) new Image().src = introUrl
}, { immediate: true })
const phase = computed(() => (s.value?.status === 'running' ? s.value.phase : null))
const isLeader = computed(() => !!auth.user?.isLeader)
/**
 * 지금 할 일 (docs/108, 앱인토스 "한 화면 한 과제"): 단계·역할에 따라 제목 한 줄 + 설명 한 줄. 주요 동작은 각 패널의 하단 고정 CTA.
 * 설명(desc)은 해요체·능동형·긍정문으로 (앱인토스 UX 라이팅).
 */
const task = computed<{ kicker: string; title: string; desc?: string } | null>(() => {
  const st = s.value
  if (!st) return null
  const round = st.status === 'running' ? `${st.day}라운드` : ''
  if (st.status === 'final' || st.status === 'ended') {
    const f = st.final
    if (st.status === 'final' && f?.step === 'vote' && !f.closed) return { kicker: '최종장 · 최종 투표', title: '상금 화폐에 투표해 주세요', desc: '보석과 골드 중 하나를 고르면 돼요. 한 번 내면 바꿀 수 없어요.' }
    if (st.status === 'ended') return { kicker: '게임 끝', title: '수고하셨어요', desc: '결과는 아래에서 볼 수 있어요.' }
    return { kicker: '최종장', title: '결과 발표를 기다려 주세요', desc: '진행자가 다음 단계로 넘기면 화면이 바뀌어요.' }
  }
  if (st.status !== 'running') return null
  const L = isLeader.value
  switch (st.phase) {
    case 'leader': return { kicker: `${round} · 리더 선출`, title: '팀 리더를 정해 진행자에게 알려 주세요', desc: '진행자가 리더를 지정하면 알림이 와요.' }
    case 'production': return { kicker: `${round} · 생산게임`, title: '생산게임에 참여해 주세요', desc: '결과에 따라 진행자가 팀 재화를 넣어 줘요.' }
    case 'trade': return L
      ? { kicker: `${round} · 거래`, title: '다른 팀과 거래하거나 전쟁을 선포할 수 있어요', desc: '거래는 협의한 내용을 진행자에게 알리면 진행자가 바로 체결해요.' }
      : { kicker: `${round} · 거래`, title: '리더가 거래를 진행하는 중이에요', desc: '팀 재화와 알림을 확인해 주세요.' }
    case 'council': return L
      ? { kicker: `${round} · 리더 협의`, title: '리더 협의에 참여해 주세요', desc: '안건은 대가 없는 원조(게임 전체 라운드당 1회, 리더 4명 중 3명 찬성)와 다음 라운드 전쟁 허용/제재예요. 결과는 진행자가 입력해요.' }
      : { kicker: `${round} · 리더 협의`, title: '리더 협의 결과를 기다려 주세요', desc: '결과가 정해지면 알림이 와요.' }
    case 'life': return L
      ? { kicker: `${round} · 라이프 제출`, title: '살릴 인원을 정해 제출해 주세요', desc: '리더 외 생존자는 무작위로 정해져요.' }
      : { kicker: `${round} · 라이프 제출`, title: '리더가 라이프를 제출하는 중이에요', desc: '결과가 나오면 알림이 와요.' }
  }
  return null
})
// 테러리스트(docs/100 N4): 게임이 시작되면 본인에게만 무음 안내 1번. 알림 기록·소리 없음 (서버도 이벤트로 보내지 않는다)
const spyIntro = ref(false)
const spySeenKey = () => `csd:spy-seen:${auth.user?.id}`
watch(() => game.team?.spy, (spy) => {
  if (!spy || spyIntro.value) return
  try {
    if (localStorage.getItem(spySeenKey())) return
    localStorage.setItem(spySeenKey(), '1')
  } catch { /* 저장 못 하면 매번 보일 수 있음 */ }
  spyIntro.value = true
}, { immediate: true })
const isLastRound = computed(() => s.value?.status === 'running' && s.value.day >= (s.value.totalDays ?? Infinity))
const final = computed(() => (s.value?.status === 'final' || s.value?.status === 'ended' ? s.value.final : null))
</script>

<template>
  <div class="page">
    <IntroOverlay v-if="intro" @done="intro = false" />
    <SpyCard v-if="spyIntro && !intro && game.team?.spy" :spy="game.team.spy" intro @close="spyIntro = false" />
    <TopBar :title="beforeStart ? 'CSD' : group?.name ?? '팀'" :color="beforeStart ? null : group?.color" />
    <NameSetup v-if="auth.user && !auth.user.nameSet" />
    <ReadyLobby v-else-if="beforeStart" />
    <template v-else>
    <div v-if="task" class="task">
      <p class="label">{{ task.kicker }}</p>
      <h1 class="task-title">{{ task.title }}</h1>
      <p v-if="task.desc" class="task-desc">{{ task.desc }}</p>
    </div>
    <ResultsBoard v-if="final" :final="final" :results="s?.results ?? null" />
    <FinalVotePanel
      v-if="final && final.step === 'vote' && s?.status === 'final' && game.team"
      :final="final"
      :life-vote="!!s.lifeVote"
      :team-lives="game.team.resources.life"
      :my-vote="game.team.myFinalVote"
      :is-leader="isLeader"
    />
    <div class="card">
      <h2>팀 재화</h2>
      <ResourceRow show-label :amounts="game.team?.resources" />
      <p class="muted" style="margin: 10px 0 0">우리 팀만 볼 수 있어요.</p>
    </div>

    <LeaderSelect v-if="phase === 'leader'" :members="members" :election="game.team?.election ?? null" />
    <TradePanel v-else-if="phase === 'trade' && group && game.team" />
    <LifeSubmit
      v-else-if="phase === 'life' && group && game.team"
      :members="members"
      :lives="game.team.resources.life"
      :is-leader="isLeader"
      :team-color="group.color"
      :submission="game.team.lifeSubmission"
    />
    <!-- 마지막 라운드 필수 안건 (docs/100 N2) -->
    <div v-else-if="phase === 'council' && isLastRound" class="card">
      <p style="margin: 0">
        <Icon name="scroll" /> <strong>필수 안건: 남은 라이프를 최종 투표권으로 인정할까요?</strong>
        <span class="muted">— 부결이면 최종 투표는 리더만 1표. 통과하면 팀 라이프 1개로 1표 (1인 1장): 리더는 1표 더, 팀원은 이것으로 투표.
          {{ s?.lifeVote == null ? '' : s.lifeVote ? '결과: 통과' : '결과: 부결' }}</span>
      </p>
    </div>
    <!-- 전쟁: 거래 활동 단계에서 선포. 진행 중이면 다른 단계에서도 상황 표시 -->
    <WarPanel
      v-if="group && game.team && (phase === 'trade' || s?.war?.active)"
      :my-team-id="group.id"
      :is-leader="isLeader"
      :resources="game.team.resources"
    />
    <!-- 이주 (docs/100 N3): 이주 시작 라운드부터 -->
    <MigrationPanel
      v-if="s?.status === 'running' && group && game.team?.migration"
      :migration="game.team.migration"
      :my-team-id="group.id"
      :is-leader="isLeader"
      :day="s.day"
    />
    <!-- 화이트팀 보석 / 옐로우팀 골드 발행 (그 팀만) -->
    <IssuePanel v-if="s?.status === 'running' && game.team?.issue" :issue="game.team.issue" :is-leader="isLeader" />

    <div class="card">
      <h2>팀원</h2>
      <ul class="feed">
        <li v-for="m in members" :key="m.id">
          {{ m.name }} <span v-if="m.isLeader" class="badge">리더</span>
        </li>
      </ul>
    </div>
    <EventFeed collapsible plain />
    </template>
  </div>
</template>

<style scoped>
/* 지금 할 일 (TDS Top): 카드 밖, 보조 13px → 제목 22px bold → 설명 15px grey700. 위아래 여백 24px */
.task { padding: 8px 4px 20px; }
.task .label { margin: 0 0 6px; }
.task-title { font-size: 1.45rem; line-height: 1.35; margin: 0 0 6px; }
.task-desc { margin: 0; color: var(--ink-2); }
</style>
