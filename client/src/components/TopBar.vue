<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useRealtimeStore } from '../stores/realtime'
import { useToastStore } from '../stores/toasts'
import DocumentBanner from './DocumentBanner.vue'
import TeamMark from './TeamMark.vue'
import GamePhaseBar from './GamePhaseBar.vue'

/** color 가 있으면 제목 앞에 팀 색 점을 붙인다 (팀 화면). large 는 프레젠테이션용 큰 단계 표시줄 */
defineProps<{ title: string; color?: string | null; large?: boolean }>()
const auth = useAuthStore()
const rt = useRealtimeStore()
const toasts = useToastStore()
const router = useRouter()

async function logout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="topbar">
    <div>
      <h1 style="margin: 0"><TeamMark v-if="color" :color="color" size="lg" />{{ title }}</h1>
      <span class="muted">{{ auth.user?.name }} ({{ auth.user?.role }})</span>
    </div>
    <div class="row">
      <span v-if="rt.connected" class="badge on">실시간 연결됨</span>
      <button v-else class="badge off reconnect" type="button" title="눌러서 다시 연결" @click="rt.reconnect()">연결 끊김 · 재연결</button>
      <button v-if="toasts.sound" class="secondary" :title="toasts.muted ? '알림음 꺼짐 · 눌러서 설정' : '알림음 켜짐 · 눌러서 설정'" @click="router.push('/sound')">{{ toasts.muted ? '🔕' : '🔔' }}</button>
      <button class="secondary" @click="router.push('/rules')">룰</button>
      <button class="secondary" @click="logout">로그아웃</button>
    </div>
  </div>
  <DocumentBanner />
  <GamePhaseBar :large="large" />
</template>

<style scoped>
.reconnect { cursor: pointer; font-family: var(--font-mono); font-weight: 400; padding: 2px 7px; font-size: 0.7rem; }
</style>
