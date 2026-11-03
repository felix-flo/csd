<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import { audioReady, unlockAudio } from './lib/chime'
import FullNotice from './components/FullNotice.vue'
import Crest from './components/Crest.vue'
import { useGameStore } from './stores/game'
import ConfirmHost from './components/ConfirmHost.vue'
import VersionBanner from './components/VersionBanner.vue'

const auth = useAuthStore()
const game = useGameStore()
onMounted(() => {
  auth.bootstrap()
  // 알림음: 브라우저 자동재생 정책 때문에 첫 클릭/키 입력 때 AudioContext 를 깨워 둔다
  const unlock = () => {
    unlockAudio()
    if (audioReady()) {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
})
</script>

<template>
  <div v-if="!auth.ready" class="page muted">로딩 중…</div>
  <template v-else>
    <VersionBanner />
    <RouterView />
    <ConfirmHost />
  </template>
  <!-- 탈락 통보: 확인을 누르면 로그아웃 -->
  <FullNotice v-if="auth.eliminated" center title="탈락" :message="game.state?.day ? `${game.state.day}라운드에서 탈락했습니다` : undefined" action="확인" @close="auth.leaveEliminated()">
    <Crest :size="110" />
  </FullNotice>
</template>
