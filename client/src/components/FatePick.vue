<script setup lang="ts">
/**
 * 운명의 카드 (docs/100 N4). 준비 상태에서 팀을 고른 직후 전체 화면으로 뜬다 — 닫기 없음, 1회.
 * 태양·달 카드 중 하나를 누르면 "지금 선택을 제출하겠습니까? 선택은 되돌릴 수 없습니다" 예/아니오 → 제출.
 * 달 = 테러리스트 후보 (화면에는 의미를 쓰지 않는다)
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
    <div class="box">
      <span class="legend">운명의 카드</span>
      <p class="question">오늘 당신을 이끌<br />운명의 카드를 선택하세요</p>
      <div class="cards">
        <button v-for="c in CARDS" :key="c.fate" type="button" class="card-btn" :disabled="busy" :aria-label="c.label" @click="picked = c.fate">
          <img :src="c.src" :alt="c.label" draggable="false" />
          <span class="label">{{ c.label }}</span>
        </button>
      </div>
      <p class="hint">선택은 되돌릴 수 없습니다</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
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
/* 흰 바탕 + 이중 금선 박스. 카드 그림의 금색 이중 테두리를 박스에서 반복하고, 소제목이 테두리에 걸친다 (2026-10-30 B안) */
.fate {
  --gold: #c9a95c;
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: var(--bg);
  color: var(--ink);
  overflow-y: auto;
}
.box {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  width: 100%;
  max-width: 640px;
  margin-top: 16px;
  padding: clamp(36px, 6vw, 48px) clamp(16px, 4vw, 32px) clamp(24px, 4vw, 32px);
  border: 2px solid var(--gold);
  border-radius: 12px;
  outline: 1px solid var(--gold);
  outline-offset: 4px;
}
.legend {
  position: absolute;
  top: -0.8em;
  left: 50%;
  transform: translateX(-50%);
  padding: 0 12px;
  background: var(--bg);
  font-family: var(--font-display);
  font-size: clamp(0.85rem, 2.5vw, 1rem);
  letter-spacing: 0.35em;
  color: var(--gold);
  white-space: nowrap;
}
.question {
  margin: 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: clamp(1.4rem, 5vw, 2.2rem);
  line-height: 1.4;
  letter-spacing: 0.02em;
}
.cards { display: flex; gap: clamp(12px, 4vw, 32px); justify-content: center; width: 100%; }
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
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.2);
  transition: box-shadow 0.2s ease;
}
.card-btn:hover:not(:disabled), .card-btn:focus-visible { transform: translateY(-6px); }
.card-btn:hover:not(:disabled) img, .card-btn:focus-visible img { box-shadow: 0 14px 32px rgba(0, 0, 0, 0.28), 0 0 0 2px var(--gold); }
.label { font-family: var(--font-display); font-size: 1.2rem; letter-spacing: 0.3em; }
.hint { margin: 0; font-size: 0.85rem; color: var(--muted); }
.error { margin: 0; color: var(--red); }
</style>
