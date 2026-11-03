<script setup lang="ts">
import Icon from '../components/Icon.vue'
import FixedBottomCta from '../components/FixedBottomCta.vue'
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ApiError } from '../lib/api'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const pin = ref('')
const error = ref('')
const busy = ref(false)
const focused = ref(false)
const phone = window.matchMedia('(max-width: 767px)').matches
/** 테스트 모드(탭 로그인, docs/101)면 안내. 로그인 전이라 공개 /api/health 로 본다 */
const tabLogin = ref(false)
onMounted(async () => {
  // 로그인하는 사람은 대부분 참가자: PIN 을 입력하는 동안 참가자 화면 코드를 미리 받아 둔다 (라우터와 같은 청크라 로그인 직후 다시 받지 않는다)
  setTimeout(() => { void import('./GroupView.vue') }, 300)
  try {
    const res = await fetch('/api/health', { cache: 'no-store' })
    tabLogin.value = !!((await res.json()) as { tabLogin?: boolean }).tabLogin
  } catch { /* 안내만 생략 */ }
  // 개발 서버 전용: 여러 화면을 한 번에 띄울 때 주소의 PIN 으로 바로 들어간다
  if (import.meta.env.DEV && typeof route.query.pin === 'string') {
    pin.value = route.query.pin
    await submit()
  }
})

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
  <div class="entry">
    <h1>스위칭데이</h1>
    <p class="muted">배부받은 4자리 PIN 을 입력하세요</p>
    <form @submit.prevent="submit">
      <label class="cells">
        <input
          :value="pin"
          maxlength="4"
          aria-label="PIN 4자리"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          inputmode="text"
          enterkeyhint="go"
          @input="onInput"
          @focus="focused = true"
          @blur="focused = false"
          autofocus
        />
        <span
          v-for="i in 4"
          :key="i"
          class="cell mono"
          :class="{ on: focused && i - 1 === Math.min(pin.length, 3) }"
          aria-hidden="true"
        >{{ pin[i - 1] }}</span>
      </label>
      <FixedBottomCta v-if="phone" label="입장" :busy="busy" @click="submit" />
      <button v-else class="xl" type="submit" :disabled="busy">입장</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="tabLogin" class="muted"><Icon name="flask" /> 테스트 모드: 이 탭에서만 로그인됩니다. 새 탭은 다시 로그인하세요.</p>
  </div>
</template>

<style scoped>
/* 칸 네 개 위에 투명한 입력창 하나를 덮는다. 어느 칸을 눌러도 키보드가 뜨고 붙여넣기도 된다 */
.cells { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.cells input {
  position: absolute;
  inset: 0;
  width: 100%;
  padding: 0;
  font-size: 16px; /* iOS 는 16px 보다 작은 입력창을 누르면 화면을 확대한다 */
  color: transparent;
  caret-color: transparent;
  background: transparent;
  border: 0;
  box-shadow: none;
}
.cells input::selection { background: transparent; }
.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 72px;
  font-size: 2rem;
  font-weight: 700;
  border-radius: var(--radius-card);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
.cell.on { box-shadow: inset 0 0 0 2px var(--ink); }
</style>
