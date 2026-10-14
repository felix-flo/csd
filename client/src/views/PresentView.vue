<script setup lang="ts">
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import AccessQr from '../components/AccessQr.vue'
</script>

<template>
  <div class="page" style="max-width: 1100px">
    <TopBar title="프레젠테이션" />
    <div class="present-grid">
      <div class="card">
        <h2>공개 현황판</h2>
        <p class="muted">공개 가능한 재화 정보 / 공지 / 알람 표시 영역. 룰 확정 후 구현 예정.</p>
      </div>
      <div class="card">
        <h2>접속 주소</h2>
        <AccessQr />
      </div>
    </div>
    <EventFeed />
  </div>
</template>

<style scoped>
.present-grid { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: start; }
@media (max-width: 720px) { .present-grid { grid-template-columns: 1fr; } }
</style>
