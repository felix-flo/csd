<script setup lang="ts">
/** 화면 상단 플로팅 알림. App.vue 에 한 번만 둔다 */
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toasts'

const toasts = useToastStore()
const auth = useAuthStore()
const large = computed(() => auth.user?.role === 'presenter')
</script>

<template>
  <div class="toast-host" :class="{ large }" role="status" aria-live="polite"
       @mouseenter="toasts.setPaused(true)" @mouseleave="toasts.setPaused(false)">
    <TransitionGroup name="toast">
      <div v-for="t in toasts.items" :key="t.id" class="toast" :class="{ war: t.war }">
        <div class="toast-head">
          <span class="label">📢 {{ t.label }}</span>
          <button class="close" type="button" aria-label="닫기" @click="toasts.dismiss(t.id)">✕</button>
        </div>
        <div class="toast-body">{{ t.message }}</div>
        <div class="bar" :style="{ width: `${(t.remaining / toasts.duration) * 100}%` }" />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 12px;
  right: 12px;
  left: 12px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
@media (min-width: 720px) {
  .toast-host { left: auto; width: 380px; }
  .toast-host.large { width: 640px; }
}
.toast {
  pointer-events: auto;
  position: relative;
  overflow: hidden;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line);
  border-left: 3px solid var(--blue);
  border-radius: var(--radius);
  padding: 10px 12px 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}
.toast-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
.toast .label { color: var(--muted); font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.04em; }
.toast-body { font-size: 1.05rem; line-height: 1.4; word-break: keep-all; overflow-wrap: anywhere; }
.large .toast-body { font-size: 1.8rem; }
.large .label { font-size: 0.9rem; }
.close {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--muted);
  padding: 2px 8px;
  font-size: 0.85rem;
  line-height: 1.2;
}
.close:hover { background: var(--bg-soft); color: var(--ink); border-color: var(--line-strong); }
.bar { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--blue); transition: width 0.1s linear; }
.toast.war { border: 2px solid var(--red); border-left-width: 6px; background: var(--red-bg); }
.toast.war .toast-body { font-weight: 700; color: var(--red); font-size: 1.2rem; }
.large .toast.war .toast-body { font-size: 2.2rem; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px); }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
</style>
