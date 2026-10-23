<script setup lang="ts">
/**
 * 라이프 제출 (리더). 팀 라이프(💙)를 팀원 카드로 끌어다 놓으면 그 팀원이 팀 색으로 활성화된다.
 * - 드래그는 pointer 이벤트로 직접 구현 (HTML5 drag&drop 은 모바일 터치에서 동작하지 않음). 카드를 탭해도 할당/해제된다.
 * - 제출 → "정말로 제출하겠습니까?" 확인 → 라이프를 못 받은 팀원은 즉시 탈락(로그인 차단·세션 종료).
 * 팀원은 진행 상황만 본다. 활성 팀원이 1명뿐이면 제출하지 않는다 (자동 생존, 라이프 소모 없음).
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import type { PublicUser } from '../../../shared/types'
import { isLifeExempt, type LifeSubmissionView } from '../../../shared/game'
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

const assigned = ref<number[]>([])
const remaining = computed(() => props.lives - assigned.value.length)
const busy = ref(false)
const error = ref('')
const confirmOpen = ref(false)
const result = ref<LifeSubmissionView | null>(null)
const shown = computed(() => props.submission ?? result.value)

function toggle(id: number) {
  if (!props.isLeader || shown.value) return
  if (assigned.value.includes(id)) assigned.value = assigned.value.filter((x) => x !== id)
  else if (remaining.value > 0) assigned.value = [...assigned.value, id]
}

// ---- pointer 드래그 ----
const drag = ref<{ x: number; y: number; over: number | null } | null>(null)
function memberAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-member-id]')
  return el ? Number(el.dataset.memberId) : null
}
function onDown(e: PointerEvent) {
  if (!props.isLeader || shown.value || remaining.value <= 0) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  drag.value = { x: e.clientX, y: e.clientY, over: null }
}
function onMove(e: PointerEvent) {
  if (!drag.value) return
  drag.value = { x: e.clientX, y: e.clientY, over: memberAt(e.clientX, e.clientY) }
}
function onUp(e: PointerEvent) {
  if (!drag.value) return
  const id = memberAt(e.clientX, e.clientY)
  drag.value = null
  if (id != null && !assigned.value.includes(id) && remaining.value > 0) assigned.value = [...assigned.value, id]
}
function onCancel() {
  drag.value = null
}
onBeforeUnmount(onCancel)

const savedNames = computed(() => props.members.filter((m) => assigned.value.includes(m.id)).map((m) => m.name))
const lostNames = computed(() => props.members.filter((m) => !assigned.value.includes(m.id)).map((m) => m.name))
const confirmMessage = computed(() =>
  `라이프 ${assigned.value.length}개를 사용합니다.\n생존: ${savedNames.value.join(', ') || '없음'}\n탈락: ${lostNames.value.join(', ') || '없음'}\n\n제출하면 되돌릴 수 없고, 탈락한 팀원은 바로 접속이 끊깁니다.`,
)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    const res = await api.post<{ submission: LifeSubmissionView }>('/api/game/life', { userIds: assigned.value })
    result.value = res.submission
    // 리더 본인이 탈락했으면 세션이 끊기므로 다음 요청에서 로그인 화면으로 간다
    if (res.submission.eliminated.includes(auth.user?.id ?? -1)) setTimeout(() => auth.clear(), 4000)
    else void game.load()
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
      <p>제출 완료 · 라이프 {{ shown.livesUsed }}개 사용</p>
      <p>생존: <strong>{{ shown.saved.map(nameOf).join(', ') || '없음' }}</strong></p>
      <p v-if="shown.eliminated.length" class="error">탈락: {{ shown.eliminated.map(nameOf).join(', ') }}</p>
      <p v-if="shown.eliminated.includes(auth.user?.id ?? -1)" class="muted">라이프를 받지 못해 탈락했습니다. 곧 접속이 종료됩니다.</p>
    </template>

    <template v-else-if="isLifeExempt(members.length)">
      <p>팀원이 1명이라 라이프 제출이 없습니다. 라이프를 쓰지 않고 그대로 생존합니다.</p>
    </template>

    <template v-else-if="!isLeader">
      <p class="muted">리더가 라이프를 받을 팀원을 고르는 중입니다. 라이프를 받지 못한 팀원은 탈락합니다.</p>
    </template>

    <template v-else>
      <p class="muted">💙 를 팀원 카드로 끌어다 놓거나 카드를 눌러 라이프를 줍니다. 다시 누르면 회수합니다. 본인도 포함됩니다.</p>
      <div class="tokens" :class="{ empty: remaining <= 0 }">
        <span class="label">남은 라이프 {{ remaining }} / {{ lives }}</span>
        <span
          v-for="i in Math.max(remaining, 0)"
          :key="i"
          class="token"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onCancel"
        >💙</span>
      </div>
      <ul class="members">
        <li
          v-for="m in members"
          :key="m.id"
          :data-member-id="m.id"
          class="member"
          :class="{ on: assigned.includes(m.id), over: drag?.over === m.id }"
          :style="{ '--team': teamColor }"
          @click="toggle(m.id)"
        >
          <span class="heart">{{ assigned.includes(m.id) ? '💙' : '♡' }}</span>
          <span class="name">{{ m.name }}<span v-if="m.id === auth.user?.id" class="muted"> (나)</span></span>
          <span v-if="m.isLeader" class="badge">리더</span>
        </li>
      </ul>
      <div class="row" style="margin-top: 12px">
        <button :disabled="busy" @click="confirmOpen = true">제출</button>
        <span class="muted">생존 {{ assigned.length }}명 · 탈락 {{ members.length - assigned.length }}명</span>
      </div>
    </template>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="drag" class="ghost" :style="{ left: `${drag.x}px`, top: `${drag.y}px` }">💙</div>

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
.tokens {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 10px;
  margin-bottom: 10px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius);
  min-height: 52px;
}
.tokens.empty { border-style: solid; border-color: var(--line-soft); }
.tokens .label { margin-right: 6px; }
.token {
  font-size: 1.7rem;
  line-height: 1;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.members { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.member {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 14px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg-soft);
  color: var(--muted);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.member .name { flex: 1; }
.member.over { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg); }
/* 라이프 받은 팀원: 팀 색으로 활성화 (화이트 팀은 흰 바탕이라 진한 테두리) */
.member.on {
  background: color-mix(in srgb, var(--team) 22%, var(--surface));
  border-color: color-mix(in srgb, var(--team) 70%, var(--ink));
  color: var(--ink);
  font-weight: 600;
}
.heart { font-size: 1.2rem; }
.ghost {
  position: fixed;
  z-index: 950;
  font-size: 2rem;
  pointer-events: none;
  transform: translate(-50%, -60%);
}
</style>
