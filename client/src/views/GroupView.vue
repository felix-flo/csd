<script setup lang="ts">
import Icon from '../components/Icon.vue'
import { computed, onMounted, ref, watch, onBeforeUnmount } from 'vue'
import TopBar from '../components/TopBar.vue'
import WarCall from '../components/WarCall.vue'
import NoticeBar from '../components/NoticeBar.vue'
import NameSetup from '../components/NameSetup.vue'
import TeamStock from '../components/TeamStock.vue'
import TeamRoster from '../components/TeamRoster.vue'
import LifeSubmit from '../components/LifeSubmit.vue'
import ResultsBoard from '../components/ResultsBoard.vue'
import ReadyLobby from '../components/ReadyLobby.vue'
import IssuePanel from '../components/IssuePanel.vue'
import WarPanel from '../components/WarPanel.vue'
import GameDock from '../components/GameDock.vue'
import FinalVotePanel from '../components/FinalVotePanel.vue'
import MigrationPanel from '../components/MigrationPanel.vue'
import SpyCard from '../components/SpyCard.vue'
import OpeningPhone from '../components/OpeningPhone.vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useRealtimeStore } from '../stores/realtime'
import { useGameStore } from '../stores/game'
import { api } from '../lib/api'
import type { GroupInfo, PublicUser } from '../../../shared/types'
import { isBeforeStart, isLifeExempt } from '../../../shared/game'

const auth = useAuthStore()
const router = useRouter()
const rt = useRealtimeStore()
const game = useGameStore()
const group = ref<GroupInfo | null>(null)
const members = ref<PublicUser[]>([])
const s = computed(() => game.state)
// 시작 전(설정·준비)에는 게임 화면 대신 입장 화면처럼 따로 뜨는 준비 화면. 위쪽 막대·알림도 없고 실제 팀 이름도 보이지 않는다. 상태를 모르면(로딩 중) 준비 화면으로 둔다
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
// 내 팀 색 배경 (style.css body[data-team]). 시작 전에는 팀을 드러내지 않는다
watch([beforeStart, () => group.value?.code], ([before, code]) => {
  if (!before && code) document.body.dataset.team = code
  else delete document.body.dataset.team
}, { immediate: true })
onBeforeUnmount(() => { delete document.body.dataset.team })
// 팀 이동·탈락·복귀·리더 선출 알림, 팀 이름·색 변경이 오면 팀원 목록을 다시 받는다 (재로그인 불필요)
watch(() => [rt.groupVersion, auth.user?.groupId], load)
// 내 팀이 바뀌면 팀 게임 정보도 다시
watch(() => auth.user?.groupId, () => game.load())

// 게임이 시작되면 팀 정보를 받는다
watch(beforeStart, (v) => {
  if (!v) void load()
})

const phase = computed(() => (s.value?.status === 'running' && !s.value.opening ? s.value.phase : null))
const isLeader = computed(() => !!auth.user?.isLeader)
/**
 * 지금 할 일 (docs/108, 앱인토스 "한 화면 한 과제"): 단계·역할에 따라 제목 한 줄 + 설명 한 줄. 주요 동작은 각 패널의 하단 고정 CTA.
 * 설명(desc)은 해요체·능동형·긍정문으로 (앱인토스 UX 라이팅).
 */
/** 1라운드 리더가 정해지기 전. 시작할 때는 리더가 없다 */
const leaderPending = computed(() => phase.value === 'leader' && s.value?.day === 1 && game.team?.election?.status !== 'done')
const leaderTask = computed(() => {
  if (leaderPending.value) return { title: '우리 팀 리더를 정해 주세요', desc: '팀원들과 협의해 리더 1명을 정하고 진행자에게 알려 주세요.' }
  const leader = members.value.find((m) => m.isLeader)
  if (game.team?.election?.status === 'done' && leader) return { title: `이번 라운드 리더는 ${leader.name}입니다` }
  return { title: '리더 재신임을 논의해 주세요', desc: '재신임할지 교체할지 정해 진행자에게 알려 주세요.' }
})
const task = computed<{ kicker?: string; title: string; desc?: string } | null>(() => {
  const st = s.value
  if (!st) return null
  const round = st.status === 'running' ? `${st.day}라운드` : ''
  if (st.status === 'final' || st.status === 'ended') {
    const f = st.final
    if (st.status === 'final' && f?.step === 'vote' && !f.closed) return { kicker: '최종장 · 최종 투표', title: '상금 화폐에 투표해 주세요', desc: '보석과 골드 중 하나를 고르면 됩니다. 한 번 내면 바꿀 수 없습니다.' }
    if (st.status === 'ended') return { kicker: '게임 끝', title: '수고하셨습니다', desc: '결과는 아래에서 볼 수 있습니다.' }
    if (st.status === 'final' && f?.step === 'vote') return { kicker: '최종장', title: '결과 발표를 기다려 주세요', desc: '진행자가 다음 단계로 넘기면 화면이 바뀝니다.' }
    return { kicker: '최종장', title: '최종 결과입니다' }
  }
  if (st.status !== 'running' || st.opening) return null
  const L = isLeader.value
  switch (st.phase) {
    case 'leader': return leaderTask.value
    case 'production': return { kicker: `${round} · 생산게임`, title: '생산게임에 참여해 주세요', desc: '진행요원과의 게임 결과에 따라\n재화가 지급됩니다.' }
    case 'trade': return { title: L ? '거래는 진행자에게 가서 진행합니다' : '거래 시간입니다' }
    case 'council': return L
      ? { kicker: `${round} · 리더 협의`, title: '리더 협의에 참여해 주세요', desc: st.war?.sanctionOff || isLastRound.value
        ? '안건은 대가 없는 원조(라운드마다 전체 1번, 리더 4명 중 3명 찬성)입니다. 결과는 진행자가 입력합니다.'
        : '안건은 대가 없는 원조(라운드마다 전체 1번, 리더 4명 중 3명 찬성)와 다음 라운드 전쟁 제재(리더 3명 이상 찬성 시 금지)입니다. 결과는 진행자가 입력합니다.' }
      : { kicker: `${round} · 리더 협의`, title: '리더 협의 결과를 기다려 주세요', desc: '결과가 정해지면 알림이 옵니다.' }
    case 'last_issue': return L && game.team?.issue
      ? { title: '마지막 발행을 진행해 주세요', desc: '이번 발행량은 최종장 결과 때 공개됩니다.' }
      : { title: '마지막 발행 중입니다', desc: '화이트와 골드가 발행하고 있습니다. 발행량은 최종장 결과 때 공개됩니다.' }
    case 'life': {
      const sub = game.team?.lifeSubmission
      if (sub?.revealed) return { title: '라이프 제출이 끝났습니다' }
      if (sub) return { title: '라이프를 제출했습니다', desc: '모든 팀이 제출하면 결과를 발표합니다.' }
      if (isLifeExempt(members.value.length, game.team?.resources.life ?? 0)) return { title: '이번 라운드는 제출하지 않습니다', desc: '팀원이 1명이고 라이프가 없어 탈락 없이 넘어갑니다.' }
      return { title: L ? '살릴 인원 수를 정해 주세요' : '리더가 라이프를 제출하고 있습니다' }
    }
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
    <WarCall />
    <SpyCard v-if="spyIntro && s?.opening !== 'film' && game.team?.spy" :spy="game.team.spy" intro @close="spyIntro = false" />
    <template v-if="auth.user?.nameSet && !beforeStart">
      <TopBar :title="group?.name ?? '팀'" :color="group?.color" :team="group?.code" />
      <NoticeBar class="pin" @open="(n) => router.push(n.link ?? '/notices')" />
    </template>
    <NameSetup v-if="auth.user && !auth.user.nameSet" />
    <ReadyLobby v-else-if="beforeStart" />
    <OpeningPhone
      v-else-if="s?.opening"
      :step="s.opening"
      :code="group?.code"
      :team="group?.name"
      :resources="game.team?.resources"
      :members="members"
    />
    <template v-else>
    <div v-if="task" class="task">
      <p v-if="task.kicker" class="label">{{ task.kicker }}</p>
      <h1 class="task-title">{{ task.title }}</h1>
      <p v-if="task.desc" class="task-desc">{{ task.desc }}</p>
    </div>
    <ResultsBoard v-if="final" :final="final" :results="s?.results ?? null" :my-team-id="group?.id" />
    <FinalVotePanel
      v-if="final && final.step === 'vote' && s?.status === 'final' && game.team"
      :final="final"
      :granted="game.team.lifeGrant"
      :my-vote="game.team.myFinalVote"
    />
    <TeamStock :resources="game.team?.resources" />

    <LifeSubmit
      v-if="phase === 'life' && group && game.team"
      :members="members"
      :lives="game.team.resources.life"
      :is-leader="isLeader"
      :team-color="group.color"
      :submission="game.team.lifeSubmission"
    />
    <!-- 마지막 라운드 필수 안건 (docs/100 N2) -->
    <div v-else-if="phase === 'council' && isLastRound" class="card">
      <p style="margin: 0">
        <Icon name="scroll" /> <strong>필수 안건: 라이프 투표권</strong>
        <span class="muted">— 기본으로 반영됩니다. 리더 3명이 반대하면 반영하지 않습니다.{{ s?.lifeVote === false ? ' 결과: 미반영' : '' }}</span>
      </p>
    </div>
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

    <TeamRoster :members="members" :hide-leader="leaderPending" />
    </template>
    <GameDock v-if="auth.user?.nameSet && !beforeStart">
      <WarPanel v-if="group && game.team && phase === 'trade'" :my-team-id="group.id" :is-leader="isLeader" :resources="game.team.resources" />
    </GameDock>
  </div>
</template>

<style scoped>
.pin { position: sticky; top: 8px; z-index: 10; margin-bottom: 12px; }
/* 지금 할 일 (TDS Top): 카드 밖, 보조 13px → 제목 22px bold → 설명 15px grey700. 위아래 여백 24px */
.task { padding: 8px 4px 20px; }
.task .label { margin: 0 0 6px; }
.task-title { font-size: 1.9rem; line-height: 1.2; letter-spacing: -0.04em; margin: 0 0 8px; }
.task-desc { margin: 0; color: var(--ink-2); white-space: pre-line; }
</style>
