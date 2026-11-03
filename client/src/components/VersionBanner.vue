<script setup lang="ts">
import Icon from './Icon.vue'
/** 서버에 새 클라이언트 빌드가 배포되면 새로고침을 안내하는 배너. App.vue 에 한 번만 둔다 */
import { useRealtimeStore } from '../stores/realtime'

const rt = useRealtimeStore()
</script>

<template>
  <div v-if="rt.outdated" class="notice-bar" role="status">
    <Icon name="refresh" />
    <span class="text">새 버전이 배포되었습니다. 새로고침하면 최신 화면으로 바뀝니다.</span>
    <button class="small" :disabled="rt.reloading" @click="rt.reloadForUpdate()">새로고침</button>
  </div>
</template>
