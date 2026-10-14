<script setup lang="ts">
import { onMounted, ref } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import NameSetup from '../components/NameSetup.vue'
import { useAuthStore } from '../stores/auth'
import { api } from '../lib/api'
import type { GroupInfo, PublicUser } from '../../../shared/types'

const auth = useAuthStore()
const group = ref<GroupInfo | null>(null)
const members = ref<PublicUser[]>([])

onMounted(async () => {
  const res = await api.get<{ group: GroupInfo; members: PublicUser[] }>('/api/group')
  group.value = res.group
  members.value = res.members
})
</script>

<template>
  <div class="page">
    <TopBar :title="group?.name ?? '그룹'" />
    <NameSetup v-if="auth.user && !auth.user.nameSet" />
    <template v-else>
    <div class="card">
      <h2>그룹 재화</h2>
      <p class="muted">그룹 내부에서만 보이는 재화 정보 영역. 룰 확정 후 구현 예정.</p>
    </div>
    <div class="card">
      <h2>그룹원</h2>
      <ul class="feed">
        <li v-for="m in members" :key="m.id">
          {{ m.name }} <span v-if="m.isLeader" class="badge">리더</span>
          <span class="muted">(id {{ m.id }})</span>
        </li>
      </ul>
    </div>
    <div class="card">
      <h2>거래 / 전쟁</h2>
      <p class="muted">다른 그룹에 거래·전쟁 요청, 수락/거절 영역. 룰 확정 후 구현 예정.</p>
    </div>
    <EventFeed />
    </template>
  </div>
</template>
