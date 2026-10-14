<script setup lang="ts">
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
</script>

<template>
  <div class="page" style="max-width: 1100px">
    <TopBar title="프레젠테이션" />
    <div class="card">
      <h2>공개 현황판</h2>
      <p class="muted">공개 가능한 재화 정보 / 공지 / 알람 표시 영역. 룰 확정 후 구현 예정.</p>
    </div>
    <EventFeed />
  </div>
</template>
