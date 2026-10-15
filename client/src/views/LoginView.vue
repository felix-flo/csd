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

/** 입력 즉시 대문자로 바꾸고 영문·숫자만 남긴다 (서버도 같은 정규화를 한 번 더 한다) */
function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const v = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  pin.value = v
  el.value = v
}

async function submit() {
  error.value = ''
  const value = pin.value.trim().toUpperCase()
  if (!/^[A-Z0-9]{4}$/.test(value)) {
    error.value = '영문 또는 숫자 4자리를 입력하세요.'
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
      <h1 style="font-size: 3rem">CSD</h1>
      <p class="muted">배부받은 4자리 PIN 을 입력하세요</p>
      <form @submit.prevent="submit" class="row" style="justify-content: center">
        <input
          :value="pin"
          maxlength="4"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          inputmode="text"
          placeholder="AB12"
          @input="onInput"
          style="width: 6.5em; text-align: center; font-size: 1.8rem; letter-spacing: 0.3em; font-family: var(--font-mono); text-transform: uppercase"
          autofocus
        />
        <button type="submit" :disabled="busy">입장</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>
