<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import TopBar from '../components/TopBar.vue'
import NameSetup from '../components/NameSetup.vue'
import ReadyLobby from '../components/ReadyLobby.vue'
import PlayHeader from '../components/PlayHeader.vue'
import PlayProgress from '../components/PlayProgress.vue'
import PlayResources from '../components/PlayResources.vue'
import PlayMembers from '../components/PlayMembers.vue'
import PlayDock, { type DockAction } from '../components/PlayDock.vue'
import BottomSheet from '../components/BottomSheet.vue'
import InboxPanel from '../components/InboxPanel.vue'
import TradePanel from '../components/TradePanel.vue'
import LifeSubmit from '../components/LifeSubmit.vue'
import ResultsBoard from '../components/ResultsBoard.vue'
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
import { useToastStore } from '../stores/toasts'
import { api } from '../lib/api'
import { teamThemeStyle } from '../lib/teamTheme'
import type { GroupInfo, PublicUser } from '../../../shared/types'
import { isBeforeStart } from '../../../shared/game'

const auth = useAuthStore()
const rt = useRealtimeStore()
const game = useGameStore()
const toasts = useToastStore()
const router = useRouter()
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
const isLeader = computed(() => !!auth.user?.isLeader)
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
const final = computed(() => (s.value?.status === 'final' || s.value?.status === 'ended' ? s.value.final : null))
const running = computed(() => s.value?.status === 'running')
const theme = computed(() => teamThemeStyle(group.value))
// 확인 팝업은 body 로 빠져나가므로 버튼 색만 body 에 얹는다
watchEffect(() => {
  document.body.style.setProperty('--accent', theme.value['--accent'] ?? '')
  document.body.style.setProperty('--accent-fg', theme.value['--accent-fg'] ?? '')
})
onBeforeUnmount(() => {
  document.body.style.removeProperty('--accent')
  document.body.style.removeProperty('--accent-fg')
})

// ---- 시트·알림함 ----
const sheet = ref<DockAction | 'issue' | 'settings' | null>(null)
const inboxOpen = ref(false)
// 단계가 넘어가거나 전쟁이 시작되면 열려 있던 시트는 더 쓸 수 없다
watch([() => s.value?.status, () => s.value?.day, () => s.value?.phase, () => s.value?.war?.active?.id, () => s.value?.final?.closed], () => { sheet.value = null })
// 거래가 끝나면(체결·거부·취소) 거래 시트도 더 볼 것이 없다
watch(() => game.team?.trade?.id, (id) => { if (!id && sheet.value === 'trade') sheet.value = null })

async function logout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <IntroOverlay v-if="intro" @done="intro = false" />
  <SpyCard v-if="spyIntro && !intro && game.team?.spy" :spy="game.team.spy" intro @close="spyIntro = false" />

  <div v-if="beforeStart || (auth.user && !auth.user.nameSet)" class="page">
    <TopBar title="CSD" />
    <NameSetup v-if="auth.user && !auth.user.nameSet" />
    <ReadyLobby v-else />
  </div>

  <div v-else class="play" :style="theme">
    <PlayHeader @inbox="inboxOpen = true" @settings="sheet = 'settings'" />
    <PlayProgress :members="members" :my-team-id="group?.id ?? null" />
    <section v-if="final?.closed" class="area">
      <h2 class="ttl">최종 결과</h2>
      <ResultsBoard :final="final" :results="s?.results ?? null" bare />
    </section>
    <PlayResources
      :resources="game.team?.resources ?? null"
      :issue="game.team?.issue ?? null"
      :is-leader="isLeader"
      :running="running"
      @issue="sheet = 'issue'"
    />
    <PlayMembers :members="members" />
    <PlayDock :members="members" :my-team-id="group?.id ?? null" @open="sheet = $event" />

    <BottomSheet v-if="sheet" :title="sheet === 'settings' ? '설정' : undefined" @close="sheet = null">
      <template v-if="group && game.team">
        <TradePanel v-if="sheet === 'trade'" :my-team-id="group.id" :is-leader="isLeader" :trade="game.team.trade" />
        <WarPanel v-else-if="sheet === 'war'" :my-team-id="group.id" :is-leader="isLeader" :resources="game.team.resources" />
        <LifeSubmit
          v-else-if="sheet === 'life'"
          :members="members"
          :lives="game.team.resources.life"
          :is-leader="isLeader"
          :submission="game.team.lifeSubmission"
        />
        <FinalVotePanel
          v-else-if="sheet === 'vote' && final"
          :final="final"
          :life-vote="!!s?.lifeVote"
          :team-lives="game.team.resources.life"
          :my-vote="game.team.myFinalVote"
          :is-leader="isLeader"
        />
        <MigrationPanel
          v-else-if="sheet === 'migration' && game.team.migration"
          :migration="game.team.migration"
          :my-team-id="group.id"
          :is-leader="isLeader"
          :day="s?.day ?? 0"
        />
        <IssuePanel v-else-if="sheet === 'issue' && game.team.issue" :issue="game.team.issue" :is-leader="isLeader" />
      </template>
      <ul v-if="sheet === 'settings'" class="menu">
        <li v-if="toasts.sound"><button type="button" @click="router.push('/sound')"><Icon :name="toasts.muted ? 'bell-off' : 'bell'" />알림음<span class="val">{{ toasts.muted ? '꺼짐' : '켜짐' }}</span></button></li>
        <li><button type="button" @click="logout"><Icon name="logout" />로그아웃</button></li>
      </ul>
    </BottomSheet>

    <InboxPanel v-if="inboxOpen" @close="inboxOpen = false" />
  </div>
</template>

<style scoped>
.menu { margin: 6px 0 0; padding: 0; list-style: none; }
.menu button { width: 100%; min-height: 56px; display: flex; align-items: center; gap: 12px; padding: 0; background: none; border: 0; color: #f4f6fa; font-size: 18px; font-weight: 700; letter-spacing: 0; text-align: left; text-transform: none; }
.menu button:hover { background: none; color: #f4f6fa; }
.menu li + li button { border-top: 2px solid #343946; }
.menu :deep(.icon) { font-size: 24px; }
.val { margin-left: auto; font-size: 15.5px; font-weight: 700; }
</style>
