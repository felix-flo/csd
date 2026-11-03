<script setup lang="ts">
/** 첫 로그인 때 본인 닉네임 입력 (1회). 이후 변경은 진행자에게 요청 */
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import FixedBottomCta from './FixedBottomCta.vue'

const auth = useAuthStore()
const phone = window.matchMedia('(max-width: 767px)').matches
const name = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  const v = name.value.trim()
  if (v.length < 1 || v.length > 20) {
    error.value = '1~20자로 입력하세요.'
    return
  }
  busy.value = true
  try {
    await auth.setName(v)
  } catch {
    error.value = '저장에 실패했습니다. 다시 시도하세요.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="entry">
    <h1>닉네임을 입력하세요</h1>
    <p class="muted">다른 참가자와 진행자에게 표시됩니다.<br />한 번 저장하면 진행자만 바꿀 수 있습니다.</p>
    <form @submit.prevent="submit">
      <input v-model="name" maxlength="20" placeholder="닉네임" aria-label="닉네임" autocomplete="nickname" enterkeyhint="done" autofocus />
      <FixedBottomCta v-if="phone" label="저장" :busy="busy" @click="submit" />
      <button v-else class="xl" type="submit" :disabled="busy">저장</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
