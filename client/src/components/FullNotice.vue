<script setup lang="ts">
/** 전체 화면 알림. 자동으로 닫히지 않는다. action 이 있으면 버튼, 없으면 화면을 누르면 닫힌다. center 는 가운데 정렬, 슬롯에는 문양을 넣는다 */
defineProps<{ title: string; message?: string; kicker?: string; center?: boolean; action?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="full" :class="{ center, tap: !action }" role="alertdialog" :aria-label="title" @click="!action && emit('close')">
    <div class="body">
      <slot />
      <p v-if="kicker" class="kicker">{{ kicker }}</p>
      <h1>{{ title }}</h1>
      <p v-if="message" class="message" :class="{ muted: center }">{{ message }}</p>
    </div>
    <button v-if="action" class="ok lg" type="button" @click="emit('close')">{{ action }}</button>
  </div>
</template>

<style scoped>
.full { position: fixed; inset: 0; z-index: 2100; display: flex; flex-direction: column; padding: 24px 8vw calc(24px + env(safe-area-inset-bottom)); background: var(--bg); color: var(--ink); animation: fade-in 0.4s ease both; }
.full.tap { cursor: pointer; }
.body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 3vh; }
.kicker { margin: 0; font-size: clamp(1rem, 3vh, 2rem); font-weight: 700; color: var(--muted); }
h1 { margin: 0; font-size: clamp(2.6rem, 9vh, 7rem); line-height: 1.16; word-break: keep-all; }
.message { margin: 0; white-space: pre-line; font-size: clamp(1.2rem, 4.4vh, 3rem); font-weight: 700; line-height: 1.5; word-break: keep-all; }
.center .message { font-size: 1rem; font-weight: 400; }
.center .body { align-items: center; gap: 12px; text-align: center; }
.center h1 { margin-top: 14px; font-size: 60px; }
.ok { width: 100%; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .full { animation: none; } }
</style>
