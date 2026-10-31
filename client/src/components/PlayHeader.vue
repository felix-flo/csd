<script setup lang="ts">
/**
 * 참가자 게임 화면 헤더 (docs/107). 모두 아랫선에 맞춘다.
 * 왼쪽: 이름 + 연결 상태·역할. 오른쪽: 룰북·설정·알림함(새 알림이 있으면 테두리가 깜빡인다).
 * 테러리스트(docs/100 N4): 이름을 1.2초 안에 3번 누르면 테러리스트 카드를 연다 (테러리스트가 아니면 아무 일 없음)
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import SpyCard from './SpyCard.vue'
import { useAuthStore } from '../stores/auth'
import { useDocumentsStore } from '../stores/documents'
import { useGameStore } from '../stores/game'
import { useRealtimeStore } from '../stores/realtime'

const emit = defineEmits<{ inbox: []; settings: [] }>()
const auth = useAuthStore()
const game = useGameStore()
const docs = useDocumentsStore()
const rt = useRealtimeStore()
const router = useRouter()

const unread = computed(() => rt.unreadCount)

const spyOpen = ref(false)
let taps: number[] = []
function onNameTap() {
  const now = Date.now()
  taps = [...taps.filter((t) => now - t < 1200), now]
  if (taps.length >= 3) {
    taps = []
    if (game.team?.spy) spyOpen.value = true
  }
}
</script>

<template>
  <header class="top">
    <div class="who">
      <button class="name" type="button" @click="onNameTap"><b>{{ auth.user?.name }}</b></button>
      <div class="meta">
        <span v-if="rt.connected" class="net" role="img" aria-label="실시간 연결됨"><Icon name="wifi" /></span>
        <button v-else class="net-off" type="button" aria-label="연결 끊김, 눌러서 다시 연결" @click="rt.reconnect()"><Icon name="wifi-off" /></button>
        <span class="role">{{ auth.user?.isLeader ? '리더' : '팀원' }}</span>
      </div>
    </div>
    <button class="ico" type="button" :aria-label="docs.updated.length ? '룰북, 갱신됨' : '룰북'" @click="router.push('/rules')">
      <Icon name="book" /><span v-if="docs.updated.length" class="dot"></span>
    </button>
    <button class="ico" type="button" aria-label="설정" @click="emit('settings')"><Icon name="gear" /></button>
    <button class="ico" :class="{ bell: unread > 0 }" type="button" :aria-label="unread ? `알림함, 새 알림 ${unread}건` : '알림함'" @click="emit('inbox')">
      <Icon name="bell" /><span v-if="unread" class="n">{{ unread > 9 ? '9+' : unread }}</span>
    </button>
  </header>
  <button v-if="!rt.connected" class="offbar" type="button" @click="rt.reconnect()"><Icon name="refresh" />연결 끊김 · 눌러서 다시 연결</button>
  <SpyCard v-if="spyOpen && game.team?.spy" :spy="game.team.spy" @close="spyOpen = false" />
</template>

<style scoped>
.top { flex: none; display: flex; align-items: flex-end; height: 62px; padding-bottom: 5px; color: var(--on-team); }
.top button, .offbar { padding: 0; background: none; border: 0; color: inherit; letter-spacing: 0; text-transform: none; }
.top button:hover { background: none; color: inherit; }
.who { display: flex; align-items: flex-end; gap: 4px; min-width: 0; margin-right: auto; }
.name { display: block; min-width: 0; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.name b { display: block; overflow: hidden; max-width: 11em; margin-bottom: -4px; padding-right: 6px; font: 400 clamp(28px, 11vw, 42px)/1 var(--font-play); white-space: nowrap; text-overflow: ellipsis; transform: skewX(-10deg); background: var(--name); -webkit-background-clip: text; background-clip: text; color: transparent; }
.meta { flex: none; display: flex; flex-direction: column; align-items: center; gap: 1px; margin-bottom: 3px; }
.net { font-size: 22px; line-height: 0; }
.net :deep(.icon) { stroke-width: 2.6; }
.top .net-off { display: grid; place-items: center; width: 22px; height: 22px; background: #d4141c; color: #fff; font-size: 17px; }
.top .net-off:hover { background: #d4141c; color: #fff; }
.role { font-size: 15px; font-weight: 800; line-height: 1; }
.ico { position: relative; flex: none; width: 40px; height: 44px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px !important; font-size: 26px; line-height: 0; }
.ico:last-child { margin-right: -3px; }
.dot { position: absolute; top: 12px; right: 4px; width: 10px; height: 10px; border-radius: 50%; background: #ff2d2d; box-shadow: 0 0 0 2px var(--team); }
.bell::before { content: ''; position: absolute; left: 4px; right: 4px; bottom: -1px; height: 32px; border: 2px solid currentColor; box-shadow: 0 0 6px currentColor; }
.n { position: absolute; top: 3px; right: -6px; min-width: 20px; height: 20px; padding: 0 5px; background: var(--on-team); color: var(--badge-fg); font: 800 13px/20px 'Archivo', sans-serif; text-align: center; border-radius: 10px; }
.offbar { flex: none; width: 100%; min-height: 40px; margin-top: 6px; display: flex; align-items: center; justify-content: center; gap: 8px; background: #d4141c !important; color: #fff !important; font-size: 15.5px; font-weight: 800; }
@media (prefers-reduced-motion: no-preference) {
  .bell::before { animation: ring-flash 0.9s ease-in-out infinite; }
}
@keyframes ring-flash { 50% { opacity: 0.12; } }
</style>
