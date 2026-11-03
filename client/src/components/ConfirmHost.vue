<script setup lang="ts">
/** askConfirm 이 띄우는 팝업. App 에 하나만 둔다 */
import ModalDialog from './ModalDialog.vue'
import { confirmAsk } from '../lib/confirm'

function answer(ok: boolean) {
  confirmAsk.value?.resolve(ok)
  confirmAsk.value = null
}
</script>

<template>
  <ModalDialog :open="!!confirmAsk" title="확인해 주세요" :message="confirmAsk?.message" cancel-label="닫기" @confirm="answer(true)" @cancel="answer(false)" />
</template>
