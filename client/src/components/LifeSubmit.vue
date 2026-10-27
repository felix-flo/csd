<script setup lang="ts">
/**
 * 라이프 제출 (리더). 살릴 인원 수(= 쓸 라이프 수)와 자진 탈락 여부만 정한다 (docs/100.최종룰_차이_결정사항.md D1).
 * - 자진 탈락 안 함: 리더 생존 + 리더 외 팀원 중 무작위 (N−1)명. 자진 탈락: 리더 외 팀원 중 무작위 N명
 * - 범위 1 ~ min(팀 라이프, 살릴 수 있는 인원). 라이프 0개 팀은 숫자 없이 1명만 생존 (라이프 소모 없음)
 * - 제출 → "정말로 제출하겠습니까?" 확인 → 서버가 무작위로 정하고, 살지 못한 팀원은 즉시 탈락(로그인 차단·세션 종료).
 * 팀원은 진행 상황만 본다. 활성 팀원이 1명뿐이면 제출하지 않는다 (자동 생존, 라이프 소모 없음).
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
  teamColor: string
  submission: LifeSubmissionView | null
}>()
const auth = useAuthStore()
const game = useGameStore()

const selfEliminate = ref(false)
const noLives = computed(() => props.lives === 0)
const max = computed(() => lifeSubmitMax(props.members.length, props.lives, selfEliminate.value))
const count = ref(1)
const text = ref('1')
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
// 자진 탈락을 켜거나 라이프·인원이 줄면 최대에 맞춘다
watch(max, (m) => {
  if (count.value > m) {
    setCount(m)
    note.value = `최대 ${m}명까지 살릴 수 있어 ${m}(으)로 맞췄습니다`
  }
})

/** 숫자 입력: 숫자만 남기고(앞자리 0 정리), 최대를 넘으면 최대로. 비우면 입력 중에는 빈칸, 칸을 벗어나면 1 */
function onInput(e: Event) {
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

const nameOf = (id: number) => props.members.find((m) => m.id === id)?.name ?? `#${id}`
</script>

<template>
  <div class="card">
    <h2>라이프 제출</h2>

    <template v-if="shown">
      <p>제출 완료 · 라이프 {{ shown.livesUsed }}개 사용<template v-if="shown.selfEliminated"> · 리더 자진 탈락</template></p>
      <p>생존: <strong>{{ shown.saved.map(nameOf).join(', ') || '없음' }}</strong></p>
      <p v-if="shown.eliminated.length" class="error">탈락: {{ shown.eliminated.map(nameOf).join(', ') }}</p>
    </template>

    <template v-else-if="isLifeExempt(members.length)">
      <p>팀원이 1명이라 라이프 제출이 없습니다. 라이프를 쓰지 않고 그대로 생존합니다.</p>
    </template>

    <template v-else-if="!isLeader">
      <p class="muted">리더가 살릴 인원 수를 정하는 중입니다. 리더 외 생존자는 무작위로 정해지고, 나머지 팀원은 탈락합니다.</p>
    </template>

    <template v-else>
      <p class="muted">
        팀 라이프 <strong class="mono">{{ lives }}</strong> · 팀원 <strong class="mono">{{ members.length }}</strong>명 (본인 포함).
        살릴 인원 수만 정하면 리더는 생존하고, 나머지 자리는 리더 외 팀원 중 무작위로 정해집니다.
      </p>

      <p v-if="noLives" class="warn">라이프가 없어 1명만 생존합니다 (라이프 소모 없음).</p>
      <div v-else class="stepper">
        <span>💙 살릴 인원 <span class="muted">/ 최대 {{ max }}</span></span>
        <span class="row" style="gap: 4px">
          <button class="secondary sq" type="button" :disabled="busy || count <= 1" @click="setCount(count - 1); note = ''">−</button>
          <input
            class="mono num"
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
          <button class="secondary sq" type="button" :disabled="busy || count >= max" @click="setCount(count + 1); note = ''">+</button>
        </span>
        <span v-if="note" class="note">{{ note }}</span>
      </div>

      <label class="self">
        <input v-model="selfEliminate" type="checkbox" :disabled="busy" />
        리더 자진 탈락 <span class="muted">(리더도 탈락하고, 생존자를 모두 리더 외 팀원 중 무작위로 정합니다)</span>
      </label>

      <p class="preview" :style="{ '--team': teamColor }">{{ preview }}</p>

      <div class="row" style="margin-top: 12px">
        <button :disabled="busy || !valid" @click="confirmOpen = true">제출</button>
      </div>
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
.stepper { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 1.05rem; }
.note { flex-basis: 100%; text-align: right; color: var(--amber, #b7791f); font-size: 0.8rem; }
.sq { width: 34px; height: 34px; padding: 0; font-size: 1.1rem; }
.num { width: 3.6em; text-align: center; font-size: 1.05rem; padding: 4px 6px; }
.warn { color: var(--amber, #b7791f); font-weight: 600; }
.self { display: flex; gap: 8px; align-items: baseline; margin: 10px 0 0; cursor: pointer; }
.preview {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: var(--radius);
  border-left: 4px solid color-mix(in srgb, var(--team) 70%, var(--ink));
  background: var(--bg-soft);
  font-weight: 600;
}
</style>
