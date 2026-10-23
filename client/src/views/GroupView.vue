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
import { useAuthStore } from '../stores/auth'
import { useRealtimeStore } from '../stores/realtime'
import { useGameStore } from '../stores/game'
import { api } from '../lib/api'
import type { GroupInfo, PublicUser } from '../../../shared/types'

const auth = useAuthStore()
const rt = useRealtimeStore()
const game = useGameStore()
const group = ref<GroupInfo | null>(null)
const members = ref<PublicUser[]>([])

async function load() {
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

const s = computed(() => game.state)
const phase = computed(() => (s.value?.status === 'running' ? s.value.phase : null))
const isLeader = computed(() => !!auth.user?.isLeader)
const phaseHint: Record<string, string> = {
  production: '오프라인 미니게임으로 생산 활동을 합니다. 결과에 따라 진행자가 팀 재화를 지급합니다.',
  council: '리더들이 대가 없는 원조를 협의합니다. 원조는 진행자가 재화를 조정합니다.',
}
</script>

<template>
  <div class="page">
    <TopBar :title="group?.name ?? '팀'" :color="group?.color" />
    <NameSetup v-if="auth.user && !auth.user.nameSet" />
    <template v-else>
    <ResultsBoard v-if="s?.status === 'ended' && s.results" :results="s.results" />
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
    </div>

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
