<script setup lang="ts">
/** 알림함 (docs/107): 지금까지 받은 알림 전체. 연 시점에 안 읽은 알림은 레인보우 테두리로 표시하고 읽음 처리한다 */
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { eventMessage, inboxLabel } from '../lib/eventLabel'
import { useRealtimeStore } from '../stores/realtime'
import type { GameEvent } from '../../../shared/types'

const emit = defineEmits<{ close: [] }>()
const rt = useRealtimeStore()

/** 연 순간의 읽은 위치. 읽음 처리해도 이번에 연 동안은 새 알림 표시를 유지한다 */
const seenAtOpen = ref(rt.inboxSeenId)
rt.markInboxSeen()

/** 시작 전 준비 기록(초기화·설정 변경·준비)과 내부 신호는 참가자가 볼 필요가 없다 */
const isNoise = (ev: GameEvent) =>
  (ev.type === 'system' && !rt.shouldToast(ev)) ||
  ev.payload.kind === 'game.reset' ||
  (ev.payload.kind === 'game.updated' && !!ev.payload.silent && ev.payload.day == null)
const items = computed(() => rt.events.filter((ev) => !isNoise(ev)).reverse())
const busy = ref(false)
const timeOf = (s: string) => {
  const d = new Date(s.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? s : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
async function reload() {
  busy.value = true
  await rt.loadRecent(true)
  busy.value = false
}
</script>

<template>
  <div class="inbox" role="dialog" aria-modal="true" aria-label="알림함">
    <div class="head">
      <h3>알림함</h3>
      <button class="ico" type="button" aria-label="다시 불러오기" :disabled="busy" @click="reload"><Icon name="refresh" /></button>
      <button class="ico" type="button" aria-label="닫기" @click="emit('close')"><Icon name="close" /></button>
    </div>
    <p v-if="!items.length" class="empty">받은 알림이 없습니다.</p>
    <ul v-else class="list">
      <li v-for="ev in items" :key="ev.id" :class="{ new: ev.id > seenAtOpen && rt.shouldToast(ev) }">
        <div class="meta"><b v-if="ev.id > seenAtOpen && rt.shouldToast(ev)">새 알림</b>{{ inboxLabel(ev) }} · {{ timeOf(ev.createdAt) }}</div>
        <p class="msg">{{ eventMessage(ev) }}</p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.inbox { position: fixed; inset: 0; z-index: 810; display: flex; flex-direction: column; max-width: 480px; margin: 0 auto; padding: 0 14px 14px; background: #15171c; color: #f4f6fa; }
.head { flex: none; display: flex; align-items: flex-end; height: 62px; padding-bottom: 8px; }
h3 { margin: 0 auto 0 0; font: 400 30px/1 var(--font-play); }
.ico { width: 40px; height: 32px; display: flex; align-items: flex-end; justify-content: center; padding: 0 0 2px; background: none; border: 0; color: #f4f6fa; font-size: 26px; line-height: 0; }
.ico:hover { background: none; color: #f4f6fa; }
.empty { color: #c3c9d4; }
.list { flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
li { padding: 10px 10px 12px; border-top: 2px solid #343946; }
li.new { margin-bottom: 6px; border: 3px solid transparent; background: linear-gradient(#1c1f26, #1c1f26) padding-box, linear-gradient(90deg, #ff4d6d, #ff9f1c, #ffe14d, #4ade80, #38bdf8, #a78bfa) border-box; }
.meta { display: flex; gap: 8px; align-items: center; font-size: 14px; font-weight: 700; color: #c3c9d4; }
.meta b { font-weight: 800; color: #fff; }
.msg { margin: 4px 0 0; font-size: 17.5px; font-weight: 500; line-height: 1.35; word-break: keep-all; overflow-wrap: anywhere; }
li.new .msg { font-weight: 700; }
</style>
