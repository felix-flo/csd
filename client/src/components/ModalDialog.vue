<script setup lang="ts">
/**
 * 화면 가운데 팝업. 확인/취소 두 버튼 또는 확인 하나 (cancelLabel 없으면). altLabel 을 주면 그 사이에 버튼 하나 더 (예: 수락/거절/나중에).
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
}>()
const emit = defineEmits<{ confirm: []; cancel: []; alt: [] }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('cancel')">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="title">
        <h2>{{ title }}</h2>
        <p v-if="message" class="msg">{{ message }}</p>
        <slot />
        <div class="row actions">
          <button v-if="cancelLabel" class="secondary" type="button" :disabled="busy" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button v-if="altLabel" class="secondary" type="button" :disabled="busy" @click="emit('alt')">{{ altLabel }}</button>
          <button type="button" :class="{ danger }" :disabled="busy" @click="emit('confirm')">{{ confirmLabel ?? '확인' }}</button>
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
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal {
  width: min(420px, 100%);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 18px 16px 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
}
.msg { margin: 0 0 12px; white-space: pre-line; }
.actions { justify-content: flex-end; margin-top: 12px; }
</style>
