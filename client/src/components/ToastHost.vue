<script setup lang="ts">
import Icon from './Icon.vue'
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
      <div v-for="(t, i) in toasts.items" :key="t.id" class="toast" :class="{ war: t.war, sticky: toasts.sticky && i === toasts.items.length - 1 }">
        <div class="toast-head">
          <span class="label"><Icon name="megaphone" /> {{ t.label }}</span>
          <button class="close" type="button" aria-label="닫기" @click="toasts.dismiss(t.id)"></button>
        </div>
        <div class="toast-body">{{ t.message }}</div>
        <div v-if="toasts.sticky && i === toasts.items.length - 1" class="hold">닫기()를 누르면 사라집니다</div>
        <div v-else class="bar" :style="{ width: `${(t.remaining / toasts.duration) * 100}%` }" />
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
  /* 프레젠테이션: 오른쪽 아래에 쌓는다 (제목·단계·타이머를 가리지 않도록, docs/105) */
  .toast-host.large { width: 760px; top: auto; bottom: 16px; }
}
.toast {
  pointer-events: auto;
  position: relative;
  overflow: hidden;
  background: var(--surface);
  color: var(--ink);
  border: 2px solid var(--line-strong);
  border-left: 4px solid var(--blue);
  border-radius: var(--radius);
  padding: 10px 12px 12px;
}
.toast-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
.toast .label { color: var(--muted); font-family: var(--font-mono); font-size: 0.8rem; letter-spacing: 0.04em; }
.toast-body { font-size: 1.05rem; line-height: 1.4; word-break: keep-all; overflow-wrap: anywhere; }
/* 프레젠테이션(루트 20px): 본문 2.2rem = 44px — 시청 거리 ÷ 200 기준 (docs/104) */
.large .toast-body { font-size: 2.2rem; line-height: 1.3; }
.large .label { font-size: 1rem; }
.large .hold { font-size: 0.85rem; }
.large .close { font-size: 1rem; padding: 4px 12px; }
.close {
  background: transparent;
  border: 2px solid var(--line);
  color: var(--muted);
  padding: 2px 8px;
  font-size: 0.85rem;
  line-height: 1.2;
}
.close:hover { background: var(--bg-soft); color: var(--ink); border-color: var(--line-strong); }
.bar { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--blue); transition: width 0.1s linear; }
.hold { margin-top: 6px; font-size: 0.72rem; color: var(--muted); }
.toast.sticky .close { border-color: var(--blue); color: var(--blue); }
.toast.war { border: 2px solid var(--red); border-left-width: 6px; background: var(--red-bg); }
.toast.war .toast-body { font-weight: 700; color: var(--red); font-size: 1.2rem; }
.large .toast.war .toast-body { font-size: 2.6rem; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px); }
.large .toast-enter-from, .large .toast-leave-to { transform: translateY(8px); }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
</style>
