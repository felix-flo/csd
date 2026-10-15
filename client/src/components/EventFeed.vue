<script setup lang="ts">
import { computed } from 'vue'
import { useRealtimeStore } from '../stores/realtime'
import { eventMessage, scopeLabel } from '../lib/eventLabel'

const rt = useRealtimeStore()
const items = computed(() => [...rt.events].reverse())

</script>

<template>
  <div class="card">
    <h2>알림 <span class="muted">(마지막 id: {{ rt.lastEventId }})</span></h2>
    <p v-if="items.length === 0" class="muted">받은 알림이 없습니다.</p>
    <ul v-else class="feed">
      <li v-for="ev in items" :key="ev.id">
        <span class="badge" :class="ev.scope">{{ scopeLabel(ev) }}</span>
        <span class="muted"> #{{ ev.id }} · {{ ev.type }} · {{ ev.createdAt }}</span>
        <div>{{ eventMessage(ev) }}</div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.badge.group { background: var(--blue); color: #fff; border-color: var(--blue); }
.badge.user { background: var(--black); color: var(--paper); border-color: var(--black); }
</style>
