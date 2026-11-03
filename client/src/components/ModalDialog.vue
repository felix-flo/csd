<script setup lang="ts">
/**
 * 화면 가운데 팝업. 확인/닫기 두 버튼 또는 확인 하나 (cancelLabel 없으면). 앱인토스 가이드대로 왼쪽 버튼은 "취소" 대신 "닫기" 라고 쓴다 (docs/108). altLabel 을 주면 그 사이에 버튼 하나 더 (예: 수락/거절/나중에).
 * 브라우저 confirm/alert 대신 쓴다 (모바일에서 모양이 일정하고 흐름을 막지 않음).
 */
defineProps<{
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  altLabel?: string
  danger?: boolean
  busy?: boolean
  /** 확인 버튼만 끈다 (닫기는 그대로) */
  confirmDisabled?: boolean
  /** 화면 아래에서 올라오는 모양. 버튼은 위아래로 쌓인다 */
  sheet?: boolean
}>()
const emit = defineEmits<{ confirm: []; cancel: []; alt: [] }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" :class="{ sheet }" @click.self="emit('cancel')">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="title">
        <h2>{{ title }}</h2>
        <p v-if="message" class="msg">{{ message }}</p>
        <slot />
        <div class="row actions">
          <button v-if="cancelLabel" class="secondary lg" type="button" :disabled="busy" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button v-if="altLabel" class="weak lg" type="button" :disabled="busy" @click="emit('alt')">{{ altLabel }}</button>
          <button type="button" class="lg" :class="{ danger }" :disabled="busy || confirmDisabled" @click="emit('confirm')">{{ confirmLabel ?? '확인' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(25, 31, 40, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal {
  width: min(420px, 100%);
  background: var(--surface);
  border: 0;
  border-radius: 20px;
  padding: 24px 20px 20px;
}
.modal h2 { font-size: 1.33rem; margin-bottom: 8px; }
.msg { margin: 0 0 12px; white-space: pre-line; color: var(--ink-2); }
/* TDS Dialog: 버튼이 나란히 꽉 차게. 왼쪽 "닫기"(회색 면), 오른쪽 주요 */
.actions { margin-top: 16px; flex-wrap: nowrap; }
.actions > button { flex: 1 1 0; }
.sheet.modal-backdrop { align-items: flex-end; padding: 0; }
.sheet .modal { width: 100%; max-width: 480px; border-radius: 14px 14px 0 0; padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
.sheet .actions { flex-direction: column-reverse; align-items: stretch; }
.sheet .actions > button { flex: none; }
.sheet .actions > .secondary { background: none; box-shadow: none; }
</style>
