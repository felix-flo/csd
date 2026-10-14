<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ApiError } from '../lib/api'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const pin = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  const value = pin.value.trim().toLowerCase()
  if (!/^[a-z]{4}$/.test(value)) {
    error.value = '영문 소문자 4자리를 입력하세요.'
    return
  }
  busy.value = true
  try {
    await auth.login(value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
    router.replace(redirect ?? auth.homePath)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) error.value = 'PIN 이 올바르지 않습니다.'
    else if (e instanceof ApiError && e.status === 429) error.value = '시도 횟수가 너무 많습니다. 잠시 후 다시 시도하세요.'
    else error.value = '로그인에 실패했습니다.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page" style="padding-top: 15vh">
    <div class="card" style="text-align: center">
      <h1>CSD 접속</h1>
      <p class="muted">배부받은 4자리 PIN 을 입력하세요</p>
      <form @submit.prevent="submit" class="row" style="justify-content: center">
        <input
          v-model="pin"
          maxlength="4"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="abcd"
          style="width: 8em; text-align: center; font-size: 1.6rem; letter-spacing: 0.3em"
          autofocus
        />
        <button type="submit" :disabled="busy">입장</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>
