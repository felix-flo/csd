<script setup lang="ts">
import { computed } from 'vue'
import { useRealtimeStore } from '../stores/realtime'

const rt = useRealtimeStore()
const items = computed(() => [...rt.events].reverse())

function label(scope: string) {
  return { all: '전체', role: '역할', group: '그룹', user: '개인' }[scope] ?? scope
}
</script>

<template>
  <div class="card">
    <h2>알림 <span class="muted">(마지막 id: {{ rt.lastEventId }})</span></h2>
    <p v-if="items.length === 0" class="muted">받은 알림이 없습니다.</p>
    <ul v-else class="feed">
      <li v-for="ev in items" :key="ev.id">
        <span class="badge">{{ label(ev.scope) }}</span>
        <span class="muted"> #{{ ev.id }} · {{ ev.type }} · {{ ev.createdAt }}</span>
        <div>{{ (ev.payload as any).message ?? JSON.stringify(ev.payload) }}</div>
      </li>
    </ul>
  </div>
</template>
