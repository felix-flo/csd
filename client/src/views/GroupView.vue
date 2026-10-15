<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import NameSetup from '../components/NameSetup.vue'
import ResourceRow from '../components/ResourceRow.vue'
import { useAuthStore } from '../stores/auth'
import { useRealtimeStore } from '../stores/realtime'
import { api } from '../lib/api'
import type { GroupInfo, PublicUser } from '../../../shared/types'

const auth = useAuthStore()
const rt = useRealtimeStore()
const group = ref<GroupInfo | null>(null)
const members = ref<PublicUser[]>([])

async function load() {
  try {
    const res = await api.get<{ group: GroupInfo; members: PublicUser[] }>('/api/group')
    group.value = res.group
    members.value = res.members
  } catch { /* 팀 없음(404) 등: 화면은 비워 둔다 */ }
}
onMounted(load)
// 팀 이동·탈락·복귀 알림, 팀 이름·색 변경이 오면 팀원 목록을 다시 받는다 (재로그인 불필요)
watch(() => [rt.groupVersion, auth.user?.groupId], load)
</script>

<template>
  <div class="page">
    <TopBar :title="group?.name ?? '팀'" :color="group?.color" />
    <NameSetup v-if="auth.user && !auth.user.nameSet" />
    <template v-else>
    <div class="card">
      <h2>팀 재화</h2>
      <ResourceRow show-label />
      <p class="muted" style="margin: 10px 0 0">팀 내부에서만 보이는 재화. 수량은 룰 확정 후 연결 예정 (현재는 표시 미리보기).</p>
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
    <div class="card">
      <h2>거래 / 전쟁</h2>
      <p class="muted">다른 팀에 거래·전쟁 요청, 수락/거절 영역. 룰 확정 후 구현 예정.</p>
    </div>
    <EventFeed />
    </template>
  </div>
</template>
