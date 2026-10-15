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
      <div v-for="t in toasts.items" :key="t.id" class="toast">
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
  background: var(--black);
  color: var(--paper);
  border-left: 6px solid var(--red);
  padding: 10px 12px 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
}
.toast-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
.toast .label { color: #cfcdc5; }
.toast-body { font-size: 1.05rem; line-height: 1.4; word-break: keep-all; overflow-wrap: anywhere; }
.large .toast-body { font-size: 1.8rem; }
.large .label { font-size: 0.9rem; }
.close {
  background: transparent;
  border: 1px solid #555;
  color: var(--paper);
  padding: 2px 8px;
  font-size: 0.85rem;
  line-height: 1.2;
}
.close:hover { background: var(--paper); color: var(--black); border-color: var(--paper); }
.bar { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--red); transition: width 0.1s linear; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px); }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
</style>
