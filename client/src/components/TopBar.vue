<script setup lang="ts">
import Icon from './Icon.vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useRealtimeStore } from '../stores/realtime'
import { useNoticeStore } from '../stores/notices'
import TeamMark from './TeamMark.vue'
import Crest from './Crest.vue'
import GamePhaseBar from './GamePhaseBar.vue'
import SpyCard from './SpyCard.vue'
import { useGameStore } from '../stores/game'
import { askConfirm } from '../lib/confirm'
import { isBeforeStart } from '../../../shared/game'

/**
 * color 가 있으면 제목 앞에 팀 색 점을 붙인다 (팀 화면). large 는 프레젠테이션용 큰 단계 표시줄.
 * side 는 관리자 왼쪽 메뉴 안에 놓일 때: 단계 표시줄을 빼고 제목만 (단계는 위쪽 상태창에 있다).
 * 제목·작은 글씨는 슬롯(title, subtitle)으로 바꿀 수 있다 (프레젠테이션의 제목 공개 효과).
 * 제목 아래 작은 글씨: subtitle 을 주면 그대로(프레젠테이션), 아니면 내 이름 —
 * 참가자는 게임 시작 후 "이름 (리더)" / "이름 (팀원)", 시작 전에는 이름만. 관리자는 "이름 (admin)"
 * 테러리스트(docs/100 N4): 참가자가 내 이름을 1.2초 안에 3번 누르면 테러리스트 카드를 연다 (테러리스트가 아니면 아무 일 없음)
 */
const props = defineProps<{ title: string; subtitle?: string; color?: string | null; team?: string | null; large?: boolean; side?: boolean }>()
const auth = useAuthStore()
const game = useGameStore()
const who = computed(() => {
  if (props.subtitle) return props.subtitle
  const u = auth.user
  if (!u) return ''
  if (u.role !== 'member') return `${u.name} (${u.role})`
  if (!game.state || isBeforeStart(game.state.status)) return u.name
  // 오프닝과 1라운드 리더 선출 중에는 아직 리더가 없다
  const pending = game.state.status === 'running' && (game.state.opening || (game.state.day === 1 && game.state.phase === 'leader' && game.team?.election?.status !== 'done'))
  if (pending) return u.name
  return `${u.name} (${u.isLeader ? '리더' : '팀원'})`
})
// ---- 테러리스트 카드: 내 이름 3번 연속 탭 ----
const spyOpen = ref(false)
let taps: number[] = []
function onNameTap() {
  if (props.subtitle || auth.user?.role !== 'member') return
  const now = Date.now()
  taps = [...taps.filter((t) => now - t < 1200), now]
  if (taps.length >= 3) {
    taps = []
    if (game.team?.spy) spyOpen.value = true
  }
}
const rt = useRealtimeStore()
const notices = useNoticeStore()
const router = useRouter()

async function logout() {
  if (!(await askConfirm('로그아웃할까요?'))) return
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="topbar">
    <Crest v-if="team" :team="team" :size="34" class="top-crest" />
    <div class="top-text">
      <h1 style="margin: 0"><TeamMark v-if="color && !team" :color="color" size="lg" /><slot name="title">{{ title }}</slot></h1>
      <span class="muted who" @click="onNameTap"><slot name="subtitle">{{ who }}</slot></span>
    </div>
    <div class="row">
      <button v-if="!rt.connected" class="badge off reconnect" type="button" title="눌러서 다시 연결" @click="rt.reconnect()">연결 끊김 · 재연결</button>
      <button v-if="notices.sound" class="tool" aria-label="알림" title="알림" @click="router.push('/notices')"><Icon :name="notices.muted ? 'bell-off' : 'bell'" /></button>
      <button v-if="auth.user?.role !== 'member'" class="tool" aria-label="룰북" title="룰북" @click="router.push('/rules')"><Icon name="book" /></button>
      <button class="tool" aria-label="로그아웃" title="로그아웃" @click="logout"><Icon name="logout" /></button>
    </div>
  </div>
  <GamePhaseBar v-if="!side" :large="large" />
  <SpyCard v-if="spyOpen && game.team?.spy" :spy="game.team.spy" @close="spyOpen = false" />
</template>

<style scoped>
.top-crest { margin-right: 2px; }
.top-text { flex: 1; min-width: 0; }
.tool { width: 44px; min-height: 44px; padding: 0; background: none; color: var(--ink); display: inline-flex; align-items: center; justify-content: center; font-size: 26px; }
.tool:hover { background: rgba(8, 8, 8, 0.06); }
.tool :deep(.icon) { color: currentColor; }
.who { user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.reconnect { cursor: pointer; font-family: var(--font-mono); font-weight: 400; padding: 2px 7px; font-size: 0.7rem; }
</style>
