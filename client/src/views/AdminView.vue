<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import RosterCard from '../components/RosterCard.vue'
import UserAdmin from '../components/UserAdmin.vue'
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
const targetRole = ref<'admin' | 'presenter' | 'member'>('member')
const message = ref('')
const status = ref('')

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
    <RosterCard :users="users" :groups="groups" @updated="onUpdated" />
    <UserAdmin :users="users" :groups="groups" @updated="onUpdated" />
    <div class="card">
      <h2>관리 기능</h2>
      <p class="muted">그룹별 거래 승인 / 재화 수동 조정 등은 룰 확정 후 구현 예정.</p>
    </div>
    <div class="card">
      <h2>테스트 공지 보내기 <span class="muted">(개발용)</span></h2>
      <form @submit.prevent="send" class="row">
        <select v-model="scope">
          <option value="all">전체</option>
          <option value="role">역할</option>
          <option value="group">그룹 id</option>
          <option value="user">유저 id</option>
        </select>
        <select v-if="scope === 'role'" v-model="targetRole">
          <option value="member">member</option>
          <option value="presenter">presenter</option>
          <option value="admin">admin</option>
        </select>
        <input v-if="scope === 'group' || scope === 'user'" v-model.number="targetId" type="number" min="1" placeholder="id" style="width: 6em" />
        <input v-model="message" placeholder="메시지" style="flex: 1; min-width: 12em" required />
        <button type="submit">전송</button>
      </form>
      <p class="muted">{{ status }}</p>
    </div>
    <EventFeed />
  </div>
</template>
