<script setup lang="ts">
/**
 * 운명의 카드 (docs/100 N4). 준비 상태에서 팀을 고른 직후 전체 화면으로 뜬다 — 닫기 없음, 1회.
 * 태양·달 카드 중 하나를 누르면 "지금 선택을 제출하겠습니까? 선택은 되돌릴 수 없습니다" 예/아니오 → 제출.
 * 달 = 스파이 후보 (화면에는 의미를 쓰지 않는다)
 */
import { ref } from 'vue'
import type { Fate } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
import ModalDialog from './ModalDialog.vue'
import sunUrl from '../assets/sun.webp'
import moonUrl from '../assets/moon.webp'

const emit = defineEmits<{ chosen: [fate: Fate] }>()
const picked = ref<Fate | null>(null)
const busy = ref(false)
const error = ref('')
const CARDS: { fate: Fate; src: string; label: string }[] = [
  { fate: 'sun', src: sunUrl, label: '태양' },
  { fate: 'moon', src: moonUrl, label: '달' },
]

async function submit() {
  const fate = picked.value
  if (!fate) return
  busy.value = true
  error.value = ''
  try {
    await api.post('/api/game/fate', { fate })
    emit('chosen', fate)
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ''
    // 이미 골랐으면(다른 탭 등) 서버 값을 다시 받도록 부모에 맡긴다
    if (code === 'already_chosen') emit('chosen', fate)
    else error.value = e instanceof ApiError && e.detail ? e.detail : '제출하지 못했습니다. 다시 시도하세요.'
  } finally {
    busy.value = false
    picked.value = null
  }
}
</script>

<template>
  <div class="fate" role="dialog" aria-modal="true">
    <p class="question">오늘 당신을 이끌<br />운명의 카드를 선택하세요</p>
    <div class="cards">
      <button v-for="c in CARDS" :key="c.fate" type="button" class="card-btn" :disabled="busy" :aria-label="c.label" @click="picked = c.fate">
        <img :src="c.src" :alt="c.label" draggable="false" />
        <span class="label">{{ c.label }}</span>
      </button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <ModalDialog
      :open="!!picked"
      :title="`${picked === 'moon' ? '달' : '태양'} 카드를 선택했습니다`"
      message="지금 선택을 제출하겠습니까? 선택은 되돌릴 수 없습니다."
      confirm-label="예"
      cancel-label="아니오"
      :busy="busy"
      @confirm="submit"
      @cancel="picked = null"
    />
  </div>
</template>

<style scoped>
.fate {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px 16px;
  background: radial-gradient(ellipse at top, #1d2440 0%, #0b0e1a 70%);
  color: #f3e6c4;
  overflow-y: auto;
}
.question {
  margin: 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: clamp(1.4rem, 5vw, 2.2rem);
  line-height: 1.4;
  letter-spacing: 0.02em;
}
.cards { display: flex; gap: clamp(12px, 4vw, 32px); justify-content: center; width: 100%; max-width: 640px; }
.card-btn {
  flex: 1 1 0;
  max-width: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  transition: transform 0.2s ease;
}
.card-btn img {
  width: 100%;
  aspect-ratio: 690 / 955;
  object-fit: cover;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(243, 230, 196, 0.25);
  transition: box-shadow 0.2s ease;
}
.card-btn:hover:not(:disabled), .card-btn:focus-visible { transform: translateY(-6px); }
.card-btn:hover:not(:disabled) img, .card-btn:focus-visible img { box-shadow: 0 14px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(243, 214, 140, 0.45); }
.label { font-family: var(--font-display); font-size: 1.2rem; letter-spacing: 0.3em; }
.error { color: #ffb4a8; }
</style>
