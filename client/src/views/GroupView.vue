<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import NameSetup from '../components/NameSetup.vue'
import ResourceRow from '../components/ResourceRow.vue'
import LeaderVote from '../components/LeaderVote.vue'
import TradePanel from '../components/TradePanel.vue'
import LifeSubmit from '../components/LifeSubmit.vue'
import ResultsBoard from '../components/ResultsBoard.vue'
import ReadyLobby from '../components/ReadyLobby.vue'
import IssuePanel from '../components/IssuePanel.vue'
import WarPanel from '../components/WarPanel.vue'
import FinalVotePanel from '../components/FinalVotePanel.vue'
import MigrationPanel from '../components/MigrationPanel.vue'
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
const phaseHint: Record<string, string> = {
  production: '오프라인 미니게임(생산게임)을 합니다. 결과에 따라 진행자가 팀 재화를 지급합니다.',
  council: '리더들이 대가 없는 원조를 협의합니다 (팀마다 라운드당 1회 줄 수 있음). 원조는 진행자가 재화를 조정합니다.',
}
const isLastRound = computed(() => s.value?.status === 'running' && s.value.day >= (s.value.totalDays ?? Infinity))
const final = computed(() => (s.value?.status === 'final' || s.value?.status === 'ended' ? s.value.final : null))
</script>

<template>
  <div class="page">
    <IntroOverlay v-if="intro" @done="intro = false" />
    <TopBar :title="beforeStart ? 'CSD' : group?.name ?? '팀'" :color="beforeStart ? null : group?.color" />
    <NameSetup v-if="auth.user && !auth.user.nameSet" />
    <ReadyLobby v-else-if="beforeStart" />
    <template v-else>
    <ResultsBoard v-if="final" :final="final" :results="s?.results ?? null" />
    <FinalVotePanel
      v-if="final && final.step === 'vote' && s?.status === 'final' && game.team"
      :final="final"
      :life-vote="!!s.lifeVote"
      :team-lives="game.team.resources.life"
      :my-vote="game.team.myFinalVote"
    />
    <div class="card">
      <h2>팀 재화</h2>
      <ResourceRow show-label :amounts="game.team?.resources" />
      <p class="muted" style="margin: 10px 0 0">우리 팀만 볼 수 있습니다.</p>
    </div>

    <LeaderVote v-if="phase === 'leader'" :members="members" :election="game.team?.election ?? null" />
    <TradePanel
      v-else-if="phase === 'trade' && group && game.team"
      :my-team-id="group.id"
      :is-leader="isLeader"
      :trade="game.team.trade"
      :resources="game.team.resources"
    />
    <LifeSubmit
      v-else-if="phase === 'life' && group && game.team"
      :members="members"
      :lives="game.team.resources.life"
      :is-leader="isLeader"
      :team-color="group.color"
      :submission="game.team.lifeSubmission"
    />
    <div v-else-if="phase && phaseHint[phase]" class="card">
      <p class="muted" style="margin: 0">{{ phaseHint[phase] }}</p>
      <!-- 마지막 라운드 필수 안건 (docs/100 N2) -->
      <p v-if="phase === 'council' && isLastRound" style="margin: 8px 0 0">
        📜 <strong>필수 안건: 남은 라이프를 최종 투표권으로 인정할까요?</strong>
        <span class="muted">— 통과 시 최종 투표 때 팀 라이프 1개로 1표 더 (1인 1장).
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
          <span class="muted">(id {{ m.id }})</span>
        </li>
      </ul>
    </div>
    <EventFeed />
    </template>
  </div>
</template>
