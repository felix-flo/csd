<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import RosterCard from '../components/RosterCard.vue'
import UserAdmin from '../components/UserAdmin.vue'
import RulesEditor from '../components/RulesEditor.vue'
import TeamMark from '../components/TeamMark.vue'
import GameSetupCard from '../components/GameSetupCard.vue'
import GameControlCard from '../components/GameControlCard.vue'
import GameResourcesCard from '../components/GameResourcesCard.vue'
import { api } from '../lib/api'
import { useRealtimeStore } from '../stores/realtime'
import { useGameStore } from '../stores/game'
import type { AdminUser, GroupInfo } from '../../../shared/types'

const rt = useRealtimeStore()
const game = useGameStore()
const users = ref<AdminUser[]>([])
const groups = ref<GroupInfo[]>([])
async function loadUsers() {
  const res = await api.get<{ users: AdminUser[]; groups: GroupInfo[] }>('/api/admin/users')
  users.value = res.users
  groups.value = res.groups
}
onMounted(() => {
  void loadUsers()
  void game.load()
})
// 리더 선출·라이프 탈락·리셋 등으로 계정 상태가 바뀌면 다시 받는다
watch(() => rt.groupVersion, loadUsers)
// 게임 설정 저장(테스트 계정 포함 여부)·리셋은 계정 활성 상태를 바꾼다
watch(() => [game.admin?.settings.includeTest, game.admin?.state.status], loadUsers)
function onUpdated(u: AdminUser[], g?: GroupInfo[]) {
  users.value = u
  if (g) groups.value = g
}

// 개발용: 실시간 파이프라인 확인용 공지 전송
const scope = ref<'all' | 'role' | 'group' | 'user'>('all')
const targetId = ref<number | null>(null)
const targetTeam = computed(() => groups.value.find((g) => g.id === targetId.value))
watch(scope, () => { targetId.value = null })
const targetRole = ref<'admin' | 'presenter' | 'member'>('member')
const message = ref('')
const status = ref('')

async function clearNotices() {
  if (!confirm('모든 공지 알림 기록을 삭제할까요? 룰 갱신 알림과 게임 기록은 유지됩니다.')) return
  status.value = ''
  try {
    const res = await api.delete<{ deleted: number }>('/api/admin/events', { types: ['notice'] })
    status.value = `공지 ${res.deleted}건 삭제됨`
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  }
}

async function send() {
  status.value = ''
  try {
    await api.post('/api/admin/notice', {
      scope: scope.value,
      targetId: scope.value === 'group' || scope.value === 'user' ? targetId.value : null,
      targetRole: scope.value === 'role' ? targetRole.value : null,
      message: message.value,
    })
    status.value = '전송됨'
    message.value = ''
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  }
}
</script>

<template>
  <div class="page" style="max-width: 960px">
    <TopBar title="게임 진행자" />
    <GameControlCard :users="users" :groups="groups" />
    <GameResourcesCard :groups="groups" />
    <RulesEditor />
    <RosterCard :users="users" :groups="groups" @updated="onUpdated" />
    <GameSetupCard :groups="groups" />
    <UserAdmin :users="users" :groups="groups" @updated="onUpdated" />
    <div class="card">
      <h2>테스트 공지 보내기 <span class="muted">(개발용)</span></h2>
      <form @submit.prevent="send" class="row">
        <select v-model="scope">
          <option value="all">전체</option>
          <option value="role">역할</option>
          <option value="group">팀</option>
          <option value="user">개인</option>
        </select>
        <select v-if="scope === 'role'" v-model="targetRole">
          <option value="member">참가자 전원</option>
          <option value="presenter">프레젠테이션</option>
          <option value="admin">진행자</option>
        </select>
        <template v-if="scope === 'group'">
          <TeamMark v-if="targetTeam" :color="targetTeam.color" />
          <select v-model="targetId" required>
            <option :value="null" disabled>팀 선택</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </template>
        <select v-if="scope === 'user'" v-model="targetId" required>
          <option :value="null" disabled>참가자 선택</option>
          <option v-for="u in users" :key="u.id" :value="u.id">
            {{ u.groupName ?? u.role }} · {{ u.name }}{{ u.isLeader ? ' (리더)' : '' }}
          </option>
        </select>
        <input v-model="message" placeholder="메시지" style="flex: 1; min-width: 12em" required />
        <button type="submit">전송</button>
      </form>
      <div class="row" style="margin-top: 8px">
        <button class="secondary small" @click="clearNotices">공지 기록 초기화</button>
        <span class="muted">{{ status }}</span>
      </div>
    </div>
    <EventFeed />
  </div>
</template>

<style scoped>
button.small { padding: 4px 10px; font-size: 0.85rem; }
</style>
