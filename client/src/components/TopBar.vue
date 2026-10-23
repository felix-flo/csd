<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useRealtimeStore } from '../stores/realtime'
import { useToastStore } from '../stores/toasts'
import DocumentBanner from './DocumentBanner.vue'
import TeamMark from './TeamMark.vue'
import GamePhaseBar from './GamePhaseBar.vue'
import { useGameStore } from '../stores/game'
import { isBeforeStart } from '../../../shared/game'

/**
 * color 가 있으면 제목 앞에 팀 색 점을 붙인다 (팀 화면). large 는 프레젠테이션용 큰 단계 표시줄.
 * 제목·작은 글씨는 슬롯(title, subtitle)으로 바꿀 수 있다 (프레젠테이션의 제목 공개 효과).
 * 제목 아래 작은 글씨: subtitle 을 주면 그대로(프레젠테이션), 아니면 내 이름 —
 * 참가자는 게임 시작 후 "이름 (리더)" / "이름 (팀원)", 시작 전에는 이름만. 관리자는 "이름 (admin)"
 */
const props = defineProps<{ title: string; subtitle?: string; color?: string | null; large?: boolean }>()
const auth = useAuthStore()
const game = useGameStore()
const who = computed(() => {
  if (props.subtitle) return props.subtitle
  const u = auth.user
  if (!u) return ''
  if (u.role !== 'member') return `${u.name} (${u.role})`
  if (!game.state || isBeforeStart(game.state.status)) return u.name
  return `${u.name} (${u.isLeader ? '리더' : '팀원'})`
})
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
      <h1 style="margin: 0"><TeamMark v-if="color" :color="color" size="lg" /><slot name="title">{{ title }}</slot></h1>
      <span class="muted"><slot name="subtitle">{{ who }}</slot></span>
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
