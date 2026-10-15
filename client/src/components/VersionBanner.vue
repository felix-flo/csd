<script setup lang="ts">
/** 서버에 새 클라이언트 빌드가 배포되면 새로고침을 안내하는 배너. App.vue 에 한 번만 둔다 */
import { useRealtimeStore } from '../stores/realtime'

const rt = useRealtimeStore()
</script>

<template>
  <div v-if="rt.outdated" class="version-banner row">
    <span>🔄 새 버전이 배포되었습니다. 새로고침하면 최신 화면으로 바뀝니다.</span>
    <button class="small" :disabled="rt.reloading" @click="rt.reloadForUpdate()">새로고침</button>
  </div>
</template>

<style scoped>
.version-banner {
  position: sticky;
  top: 0;
  z-index: 900;
  justify-content: space-between;
  background: var(--blue-bg);
  color: var(--ink);
  border-bottom: 1px solid #cfe2ff;
  padding: 8px 16px;
}
.version-banner button { background: var(--blue); border-color: var(--blue); color: #fff; }
.version-banner button:hover { background: #0059ec; border-color: #0059ec; }
button.small { padding: 4px 10px; font-size: 0.85rem; }
</style>
