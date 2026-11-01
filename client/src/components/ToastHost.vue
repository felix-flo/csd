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
          <button class="close" type="button" aria-label="닫기" @click="toasts.dismiss(t.id)"><Icon name="close" /></button>
        </div>
        <div class="toast-body">{{ t.message }}</div>
        <div v-if="toasts.sticky && i === toasts.items.length - 1" class="hold">닫기를 누르면 사라져요</div>
        <div v-else class="bar" :style="{ width: `${(t.remaining / toasts.duration) * 100}%` }" />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: auto;
  bottom: calc(16px + env(safe-area-inset-bottom));
  right: 16px;
  left: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
@media (min-width: 720px) {
  .toast-host { left: auto; width: 400px; }
  /* 프레젠테이션: 오른쪽 아래에 쌓는다 (제목·단계·타이머를 가리지 않도록, docs/105) */
  .toast-host.large { width: 760px; }
}
/* TDS Toast: 어두운 회색(grey800) 알약, 흰 글자, 반경 16px. 하단 CTA 가 있으면 그 위로 (body.has-cta) */
.toast {
  pointer-events: auto;
  position: relative;
  overflow: hidden;
  background: #333d4b;
  color: #fff;
  border: 0;
  border-radius: 16px;
  padding: 12px 14px 14px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}
:global(body.has-cta) .toast-host:not(.large) { bottom: calc(96px + env(safe-area-inset-bottom)); }
.toast-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
.toast .label { color: #b0b8c1; font-size: 0.8rem; }
.toast-body { font-size: 1.05rem; line-height: 1.4; word-break: keep-all; overflow-wrap: anywhere; }
/* 프레젠테이션(루트 20px): 본문 2.2rem = 44px — 시청 거리 ÷ 200 기준 (docs/104) */
.large .toast-body { font-size: 2.2rem; line-height: 1.3; }
.large .label { font-size: 1rem; }
.large .hold { font-size: 0.85rem; }
.large .close { font-size: 1rem; padding: 4px 12px; }
.close { background: transparent; border: 0; color: #b0b8c1; min-height: 0; padding: 2px 6px; font-size: 1rem; line-height: 1; }
.close:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
.bar { position: absolute; left: 0; bottom: 0; height: 3px; background: #64a8ff; transition: width 0.1s linear; }
.hold { margin-top: 6px; font-size: 0.75rem; color: #b0b8c1; }
.toast.sticky .close { color: #90c2ff; }
.toast.war { background: #bc1b2a; }
.toast.war .toast-body { font-weight: 700; font-size: 1.2rem; }
.toast.war .label, .toast.war .close { color: #ffd4d6; }
.large .toast.war .toast-body { font-size: 2.6rem; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
</style>
