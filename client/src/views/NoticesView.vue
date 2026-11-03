<script setup lang="ts">
/** 지난 알림 전체. 위쪽 고정 알림이나 종 아이콘을 누르면 온다 */
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import EventFeed from '../components/EventFeed.vue'

const auth = useAuthStore()
const router = useRouter()
</script>

<template>
  <div class="page">
    <div class="topbar">
      <h1 style="margin: 0">알림</h1>
      <div class="row">
        <button class="secondary" @click="router.push('/sound')">알림음</button>
        <button class="secondary" @click="router.push(auth.homePath)">돌아가기</button>
      </div>
    </div>
    <EventFeed plain bare />
  </div>
</template>
