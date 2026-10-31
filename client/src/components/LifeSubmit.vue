<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 라이프 제출 (리더). 살릴 인원 수(= 쓸 라이프 수)와 자진 탈락 여부만 정한다 (docs/100.최종룰_차이_결정사항.md D1).
 * - 자진 탈락 안 함: 리더 생존 + 리더 외 팀원 중 무작위 (N−1)명. 자진 탈락: 리더 외 팀원 중 무작위 N명
 * - 범위 1 ~ min(팀 라이프, 살릴 수 있는 인원). 기본값은 최대이고, 리더가 직접 고치기 전까지 최대를 따라간다. 라이프 0개 팀은 숫자 없이 1명만 생존 (라이프 소모 없음)
 * - 제출 → "정말로 제출하겠습니까?" 확인 → 서버가 무작위로 정하고, 살지 못한 팀원은 즉시 탈락(로그인 차단·세션 종료).
 * 팀원은 진행 상황만 본다. 활성 팀원이 1명이고 라이프가 0개면 제출하지 않는다 (자동 생존). 1명이라도 라이프가 있으면 제출해야 하고
 * 라이프 1개를 쓰고 생존한다 (자진 탈락 불가. docs/103 §8).
 */
import { computed, ref, watch } from 'vue'
import type { PublicUser } from '../../../shared/types'
import { isLifeExempt, lifeSubmitMax, type LifeSubmissionView } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
  members: PublicUser[]
  lives: number
  isLeader: boolean
  submission: LifeSubmissionView | null
}>()
const auth = useAuthStore()
const game = useGameStore()

const selfEliminate = ref(false)
const noLives = computed(() => props.lives === 0)
/** 팀원 1명: 라이프 1개 소모·자진 탈락 없음 */
const alone = computed(() => props.members.length === 1)
const max = computed(() => lifeSubmitMax(props.members.length, props.lives, selfEliminate.value))
const count = ref(max.value)
const text = ref(String(max.value))
const touched = ref(false)
const note = ref('')
const busy = ref(false)
const error = ref('')
const confirmOpen = ref(false)
const result = ref<LifeSubmissionView | null>(null)
const shown = computed(() => props.submission ?? result.value)

function setCount(n: number) {
  count.value = Math.min(max.value, Math.max(1, n))
  text.value = String(count.value)
}
function step(n: number) {
  touched.value = true
  note.value = ''
  setCount(count.value + n)
}
// 자진 탈락을 켜거나 라이프·인원이 줄면 최대에 맞춘다
watch(max, (m) => {
  if (!touched.value) setCount(m)
  else if (count.value > m) {
    setCount(m)
    note.value = `최대 ${m}명까지 살릴 수 있어 ${m}(으)로 맞췄습니다`
  }
})

/** 숫자 입력: 숫자만 남기고(앞자리 0 정리), 최대를 넘으면 최대로. 비우면 입력 중에는 빈칸, 칸을 벗어나면 1 */
function onInput(e: Event) {
  touched.value = true
  const el = e.target as HTMLInputElement
  let digits = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  let n = digits === '' ? 0 : Number(digits)
  if (n > max.value) {
    n = max.value
    digits = String(n)
    note.value = `최대 ${n}명까지 살릴 수 있습니다`
  } else note.value = ''
  text.value = digits
  el.value = digits
  count.value = n
}
function onBlur() {
  if (count.value < 1) setCount(1)
}
/** 숫자·편집 키 외에는 막는다 (-, ., e, + 등) */
function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length > 1) return
  if (!/^[0-9]$/.test(e.key)) e.preventDefault()
}

const others = computed(() => props.members.length - 1)
/** 제출 전 미리보기 */
const preview = computed(() => {
  if (noLives.value) {
    return selfEliminate.value
      ? `리더 외 팀원 ${others.value}명 중 무작위 1명만 생존 · ${props.members.length - 1}명 탈락 (리더 포함)`
      : `리더만 생존 · ${others.value}명 탈락`
  }
  const n = count.value
  const lost = props.members.length - n
  if (alone.value) return '리더(본인) 생존 · 라이프 1개 사용'
  if (selfEliminate.value) return `리더 외 팀원 ${others.value}명 중 무작위 ${n}명 생존 · ${lost}명 탈락 (리더 포함)`
  const alive = n === 1 ? '리더만 생존' : n - 1 === others.value ? '전원 생존' : `리더 + 무작위 ${n - 1}명 생존`
  return lost ? `${alive} · ${lost}명 탈락` : `${alive} · 탈락 없음`
})
const valid = computed(() => noLives.value || (count.value >= 1 && count.value <= max.value))
const confirmMessage = computed(() =>
  `${noLives.value ? '라이프가 없어 1명만 생존합니다 (라이프 소모 없음).' : `라이프 ${count.value}개를 사용합니다.`}\n${preview.value}\n\n` +
  '리더 외 생존자는 제출하는 순간 무작위로 정해집니다. 제출하면 되돌릴 수 없고, 탈락한 팀원은 바로 접속이 끊깁니다.',
)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    const body = { count: noLives.value ? 0 : count.value, selfEliminate: selfEliminate.value }
    const res = await api.post<{ submission: LifeSubmissionView }>('/api/game/life', body)
    result.value = res.submission
    // 리더 본인이 탈락했으면 서버가 탈락을 통보하고 세션을 끊는다 ("탈락되었습니다" 5초 후 로그아웃, App.vue)
    if (!res.submission.eliminated.includes(auth.user?.id ?? -1)) void game.load()
  } catch (e) {
    error.value = e instanceof ApiError && e.detail ? e.detail : (e as Error).message
  } finally {
    busy.value = false
    confirmOpen.value = false
  }
}

// 탈락자는 활성 팀원 목록(members)에서 빠지므로 서버가 결과에 실어 준 이름을 먼저 쓴다
const nameOf = (id: number) => shown.value?.names[id] ?? props.members.find((m) => m.id === id)?.name ?? `#${id}`
</script>

<template>
  <div class="card">
    <h2>라이프 제출</h2>

    <template v-if="shown">
      <div class="lines">
        <div class="line"><span>제출 완료</span>라이프 {{ shown.livesUsed }}개 사용<em v-if="shown.selfEliminated">리더 자진 탈락</em></div>
        <div class="line"><span>생존</span>{{ shown.saved.map(nameOf).join(', ') || '없음' }}</div>
        <div v-if="shown.eliminated.length" class="line out"><span>탈락</span>{{ shown.eliminated.map(nameOf).join(', ') }}</div>
      </div>
    </template>

    <template v-else-if="isLifeExempt(members.length, lives)">
      <p class="hint">팀원이 1명이고 라이프가 없어 라이프 제출이 없습니다. 탈락 없이 그대로 생존합니다.</p>
    </template>

    <template v-else-if="!isLeader">
      <p class="hint">리더가 살릴 인원 수를 정하는 중입니다. 리더 외 생존자는 무작위로 정해지고, 나머지 팀원은 탈락합니다.</p>
    </template>

    <template v-else>
      <div class="lines">
        <div class="line"><span>팀 라이프</span>{{ lives }}개</div>
        <div class="line"><span>팀원</span>{{ members.length }}명<em>본인 포함</em></div>
      </div>
      <p class="hint">
        <template v-if="alone">팀원이 1명이라도 라이프가 있으면 제출해야 합니다. 라이프 1개를 쓰고 생존합니다.</template>
        <template v-else>살릴 인원 수만 정하면 리더는 생존하고, 나머지 자리는 리더 외 팀원 중 무작위로 정해집니다.</template>
      </p>

      <p v-if="noLives" class="hint warn">라이프가 없어 1명만 생존합니다 (라이프 소모 없음).</p>
      <p v-else-if="alone" class="hint warn"><Icon name="life" /> 살릴 인원 1명 (본인) · 라이프 1개 사용</p>
      <div v-else class="stepper">
        <span class="what"><Icon name="life" />살릴 인원<small>최대 {{ max }}명</small></span>
        <button class="secondary sq" type="button" aria-label="한 명 줄이기" :disabled="busy || count <= 1" @click="step(-1)">−</button>
        <input
          class="num"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
          :aria-label="`살릴 인원 (1~${max})`"
          :value="text"
          :disabled="busy"
          @keydown="onKeydown"
          @input="onInput"
          @blur="onBlur"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <button class="secondary sq" type="button" aria-label="한 명 늘리기" :disabled="busy || count >= max" @click="step(1)">+</button>
        <span v-if="note" class="note">{{ note }}</span>
      </div>

      <label v-if="!alone" class="self">
        <input v-model="selfEliminate" type="checkbox" :disabled="busy" />
        <span>리더 자진 탈락<small>리더도 탈락하고, 생존자를 모두 리더 외 팀원 중 무작위로 정합니다</small></span>
      </label>

      <p class="preview">{{ preview }}</p>

      <button class="wide" type="button" :disabled="busy || !valid" @click="confirmOpen = true">제출</button>
    </template>

    <p v-if="error" class="error">{{ error }}</p>

    <ModalDialog
      :open="confirmOpen"
      title="정말로 제출하겠습니까?"
      :message="confirmMessage"
      confirm-label="제출"
      cancel-label="취소"
      danger
      :busy="busy"
      @confirm="submit"
      @cancel="confirmOpen = false"
    />
  </div>
</template>

<style scoped>
.stepper { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; }
.what { flex: 1 1 0; min-width: 0; display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 6px; font-size: 17px; font-weight: 800; color: #f4f6fa; }
.what small { grid-column: 2; font-size: 14px; font-weight: 600; }
.sq { flex: none; width: 54px; height: 54px; padding: 0; font-size: 26px; line-height: 1; }
.num { flex: none; width: 64px; height: 54px; padding: 0; background: #101216; border: 2px solid #6a7283; color: #f4f6fa; font: 900 28px 'Archivo', sans-serif; text-align: center; }
.note { flex-basis: 100%; text-align: right; color: var(--amber, #ffb020); font-size: 14px; font-weight: 700; }
.warn { color: var(--amber, #ffb020); }
.self { display: flex; gap: 10px; align-items: flex-start; margin: 12px 0 0; font-size: 16px; font-weight: 800; cursor: pointer; }
.self input { flex: none; width: 22px; height: 22px; margin: 1px 0 0; }
.self small { display: block; margin-top: 2px; font-size: 14px; font-weight: 600; line-height: 1.35; word-break: keep-all; }
.preview { margin: 12px 0 0; padding: 10px 12px; border-left: 4px solid var(--team-line); background: #1c1f26; font-size: 16px; font-weight: 800; line-height: 1.35; word-break: keep-all; }
.out { color: #ff6b6b; }
</style>
