<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import { audioReady, unlockAudio } from './lib/chime'
import ToastHost from './components/ToastHost.vue'
import VersionBanner from './components/VersionBanner.vue'

const auth = useAuthStore()
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
    <ToastHost />
  </template>
  <!-- 탈락 통보: 5초 보여준 뒤 로그아웃 (auth.eliminate) -->
  <div v-if="auth.eliminated" class="eliminated" role="alertdialog" aria-live="assertive">
    <p class="title">탈락되었습니다</p>
  </div>
</template>

<style scoped>
.eliminated {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--ink) 88%, transparent);
}
.eliminated .title {
  margin: 0;
  color: #fff;
  font-family: var(--font-display);
  font-size: clamp(2rem, 9vw, 4rem);
  text-align: center;
}
</style>
