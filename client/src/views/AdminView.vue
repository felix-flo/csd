<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import RosterCard from '../components/RosterCard.vue'
import UserAdmin from '../components/UserAdmin.vue'
import RulesEditor from '../components/RulesEditor.vue'
import TeamMark from '../components/TeamMark.vue'
import { api } from '../lib/api'
import type { AdminUser, GroupInfo } from '../../../shared/types'

const users = ref<AdminUser[]>([])
const groups = ref<GroupInfo[]>([])
onMounted(async () => {
  const res = await api.get<{ users: AdminUser[]; groups: GroupInfo[] }>('/api/admin/users')
  users.value = res.users
  groups.value = res.groups
})
function onUpdated(u: AdminUser[], g?: GroupInfo[]) {
  users.value = u
  if (g) groups.value = g
}

// 개발용: 실시간 파이프라인 확인용 공지 전송. 실제 관리자 기능(거래 승인, 재화 조정)은 룰 확정 후 구현
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
    <RulesEditor />
    <RosterCard :users="users" :groups="groups" @updated="onUpdated" />
    <UserAdmin :users="users" :groups="groups" @updated="onUpdated" />
    <div class="card">
      <h2>관리 기능</h2>
      <p class="muted">팀별 거래 승인 / 재화 수동 조정 등은 룰 확정 후 구현 예정.</p>
    </div>
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
