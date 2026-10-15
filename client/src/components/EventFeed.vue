<script setup lang="ts">
import { computed } from 'vue'
import { useRealtimeStore } from '../stores/realtime'
import type { GameEvent } from '../../../shared/types'

const rt = useRealtimeStore()
const items = computed(() => [...rt.events].reverse())

const roleNames: Record<string, string> = { member: '참가자 전원', presenter: '프레젠테이션', admin: '진행자' }

/** 뱃지 문구: 전체 / 역할 · 참가자 전원 / 그룹 · B 그룹 / 개인 · 홍길동 */
function label(ev: GameEvent) {
  switch (ev.scope) {
    case 'all': return '전체'
    case 'role': return `역할 · ${roleNames[ev.targetRole ?? ''] ?? ev.targetRole ?? ''}`
    case 'group': return `그룹 · ${ev.targetName ?? `#${ev.targetId}`}`
    case 'user': return `개인 · ${ev.targetName ?? `#${ev.targetId}`}`
    default: return ev.scope
  }
}
</script>

<template>
  <div class="card">
    <h2>알림 <span class="muted">(마지막 id: {{ rt.lastEventId }})</span></h2>
    <p v-if="items.length === 0" class="muted">받은 알림이 없습니다.</p>
    <ul v-else class="feed">
      <li v-for="ev in items" :key="ev.id">
        <span class="badge" :class="ev.scope">{{ label(ev) }}</span>
        <span class="muted"> #{{ ev.id }} · {{ ev.type }} · {{ ev.createdAt }}</span>
        <div>{{ (ev.payload as any).message ?? JSON.stringify(ev.payload) }}</div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.badge.group { background: var(--blue); color: #fff; border-color: var(--blue); }
.badge.user { background: var(--black); color: var(--paper); border-color: var(--black); }
</style>
