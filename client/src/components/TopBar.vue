<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useRealtimeStore } from '../stores/realtime'

defineProps<{ title: string }>()
const auth = useAuthStore()
const rt = useRealtimeStore()
const router = useRouter()

async function logout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="topbar">
    <div>
      <h1 style="margin: 0">{{ title }}</h1>
      <span class="muted">{{ auth.user?.name }} ({{ auth.user?.role }})</span>
    </div>
    <div class="row">
      <span class="badge" :class="rt.connected ? 'on' : 'off'">{{ rt.connected ? '실시간 연결됨' : '연결 끊김' }}</span>
      <button class="secondary" @click="logout">로그아웃</button>
    </div>
  </div>
</template>
