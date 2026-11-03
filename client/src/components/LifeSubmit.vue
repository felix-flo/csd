<script setup lang="ts">
/**
 * 라이프 제출 (리더). 화면 아래 패널에서 살릴 인원 수(= 쓸 라이프 수)와 자진 탈락 여부만 정한다 (docs/100.최종룰_차이_결정사항.md D1).
 * - 자진 탈락 안 함: 리더 생존 + 리더 외 팀원 중 무작위 (N−1)명. 자진 탈락: 리더 외 팀원 중 무작위 N명
 * - 범위 1 ~ min(팀 라이프, 살릴 수 있는 인원). 라이프 0개 팀은 숫자 없이 1명만 생존 (라이프 소모 없음)
 * - 화면 아래 패널에서 리더 생존 / 리더 생존 포기 중 하나와 인원을 고르고 제출 → 확인 팝업 → 서버가 무작위로 정해 두고, 결과는 모든 팀이 제출한 뒤 발표한다, 살지 못한 팀원은 즉시 탈락(로그인 차단·세션 종료).
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
import { useRouter } from 'vue-router'

const props = defineProps<{
  members: PublicUser[]
  lives: number
  isLeader: boolean
  teamColor: string
  submission: LifeSubmissionView | null
}>()
const auth = useAuthStore()
const game = useGameStore()
const router = useRouter()

const selfEliminate = ref(false)
const noLives = computed(() => props.lives === 0)
/** 팀원 1명: 라이프 1개 소모·자진 탈락 없음 */
const alone = computed(() => props.members.length === 1)
const max = computed(() => lifeSubmitMax(props.members.length, props.lives, selfEliminate.value))
const count = ref(1)
const busy = ref(false)
const error = ref('')
const open = ref(false)
const result = ref<LifeSubmissionView | null>(null)
const shown = computed(() => props.submission ?? result.value)

function setCount(n: number) {
  count.value = Math.min(max.value, Math.max(1, n))
}
// 자진 탈락을 켜거나 라이프·인원이 줄면 최대에 맞춘다
watch(max, (m) => {
  if (count.value > m) setCount(m)
})

const valid = computed(() => noLives.value || (count.value >= 1 && count.value <= max.value))
async function submit() {
  busy.value = true
  error.value = ''
  try {
    const body = { count: noLives.value ? 0 : count.value, selfEliminate: selfEliminate.value }
    const res = await api.post<{ submission: LifeSubmissionView }>('/api/game/life', body)
    result.value = res.submission
    // 리더 본인이 탈락했으면 서버가 탈락을 통보하고 세션을 끊는다 (탈락 화면, App.vue)
    if (!res.submission.eliminated.includes(auth.user?.id ?? -1)) void game.load()
  } catch (e) {
    error.value = e instanceof ApiError && e.detail ? e.detail : (e as Error).message
  } finally {
    busy.value = false
    open.value = false
  }
}

// 탈락자는 활성 팀원 목록(members)에서 빠지므로 서버가 결과에 실어 준 이름을 먼저 쓴다
const nameOf = (id: number) => shown.value?.names[id] ?? props.members.find((m) => m.id === id)?.name ?? `#${id}`
</script>

<template>
  <div v-if="shown?.revealed" class="card">
    <h2>이번 라운드 결과</h2>
    <p class="line"><span class="muted">생존</span> {{ shown.saved.map(nameOf).join(', ') || '없음' }}</p>
    <p v-if="shown.eliminated.length" class="line error"><span class="muted">탈락</span> {{ shown.eliminated.map(nameOf).join(', ') }}</p>
  </div>

  <template v-else-if="!shown && isLeader && !isLifeExempt(members.length, lives)">
    <div class="spacer" />
    <section class="panel">
      <div v-if="!alone" class="choice" role="radiogroup" aria-label="리더 생존 여부">
        <button type="button" role="radio" :aria-checked="!selfEliminate" :class="{ on: !selfEliminate }" :disabled="busy" @click="selfEliminate = false">리더 생존</button>
        <button type="button" role="radio" :aria-checked="selfEliminate" :class="{ on: selfEliminate }" :disabled="busy" @click="selfEliminate = true">리더 생존 포기</button>
      </div>
      <div v-if="!noLives && !alone" class="stepper">
        <button class="secondary lg" type="button" aria-label="줄이기" :disabled="busy || count <= 1" @click="setCount(count - 1)">−</button>
        <b class="mono">{{ count }}<small>/ {{ max }}명</small></b>
        <button class="secondary lg" type="button" aria-label="늘리기" :disabled="busy || count >= max" @click="setCount(count + 1)">+</button>
      </div>
      <p class="say muted">
        <template v-if="noLives">라이프가 없어 1명만 생존합니다.</template>
        <template v-else-if="alone">라이프 1개를 쓰고 생존합니다.</template>
        <template v-else-if="selfEliminate">리더를 빼고 생존자를 무작위로 정합니다.</template>
        <template v-else>리더는 생존하고, 나머지는 무작위로 정합니다.</template>
      </p>
      <p v-if="error" class="say error">{{ error }}</p>
      <div class="acts">
        <button class="lg" type="button" :disabled="!valid || busy" @click="open = true">{{ noLives ? '제출' : `라이프 ${alone ? 1 : count}개 제출` }}</button>
        <button class="secondary lg" type="button" @click="router.push('/rules')">룰북</button>
      </div>
    </section>
    <ModalDialog
      :open="open"
      title="제출할까요?"
      :message="`${noLives ? '라이프 없이 제출합니다.' : `라이프 ${alone ? 1 : count}개를 사용합니다.`} 제출하면 되돌릴 수 없습니다.`"
      confirm-label="제출"
      cancel-label="닫기"
      :busy="busy"
      @confirm="submit"
      @cancel="open = false"
    />
  </template>
</template>

<style scoped>
.line { margin: 4px 0 0; }
.line .muted { margin-right: 8px; }
.choice { display: grid; grid-template-columns: 1fr 1fr; padding: 3px; border-radius: 8px; background: var(--bg-soft); }
.choice button { min-height: 40px; padding: 0 6px; border-radius: 6px; background: none; color: var(--muted); }
.choice button:hover { background: none; }
.choice button.on, .choice button.on:hover { background: var(--surface); color: var(--ink); font-weight: 700; box-shadow: 0 1px 3px rgba(8, 8, 8, 0.14); }
.stepper { display: grid; grid-template-columns: 52px 1fr 52px; align-items: center; gap: 8px; }
.stepper button { padding: 0; font-size: 22px; }
.stepper b { text-align: center; font-size: 40px; font-weight: 650; letter-spacing: -0.03em; }
.stepper small { margin-left: 4px; font-size: 15px; font-weight: 500; color: var(--muted); letter-spacing: -0.01em; }
.say { margin: 0; text-align: center; }
.spacer { height: 250px; }
.panel { position: fixed; left: 0; right: 0; bottom: 0; z-index: 800; display: flex; flex-direction: column; gap: 12px; max-width: 720px; margin: 0 auto; padding: 14px 16px calc(12px + env(safe-area-inset-bottom)); border-radius: 14px 14px 0 0; background: var(--surface); box-shadow: 0 -8px 28px -14px rgba(8, 8, 8, 0.3); }
.acts { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
</style>
