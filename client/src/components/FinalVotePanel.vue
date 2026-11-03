<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 최종 투표 (참가자, docs/100 N2). 비밀·동시 투표: 보석 / 골드 중 하나.
 * - 모든 참가자가 1표
 * - 라이프 투표권에 뽑혔으면 2표로 계산된다
 * - 확인 팝업 뒤 확정. 한 번 내면 바꿀 수 없다 (서버도 already_voted 로 거부)
 * - 득표는 진행자가 마감할 때까지 아무도 볼 수 없고, 투표한 사람 수만 보인다
 */
import { computed, ref } from 'vue'
import { RESOURCE_LABELS, type FinalState } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
import { useGameStore } from '../stores/game'
import ModalDialog from './ModalDialog.vue'
import FixedBottomCta from './FixedBottomCta.vue'

const props = defineProps<{
  final: FinalState
  /** 라이프 투표권에 뽑혔는지 */
  granted: boolean
  myVote: { choice: 'gem' | 'gold'; extra: boolean; weight: number } | null
}>()
const game = useGameStore()
const picked = ref<'gem' | 'gold' | null>(null)
const busy = ref(false)
const error = ref('')
const confirmOpen = ref(false)
const confirmText = computed(() => {
  if (!picked.value) return ''
  const votes = props.granted ? '2표 (라이프 투표권)' : '1표'
  return `${RESOURCE_LABELS[picked.value]}에 ${votes}를 던집니다. 한 번 내면 바꿀 수 없습니다.`
})

async function submit() {
  if (!picked.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await api.post<{ vote: { choice: 'gem' | 'gold'; extra: boolean; weight: number } }>('/api/final/vote', { choice: picked.value })
    if (game.team) game.team.myFinalVote = res.vote
  } catch (e) {
    error.value = e instanceof ApiError && e.detail ? e.detail : `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
    confirmOpen.value = false
    void game.load()
  }
}
</script>

<template>
  <div class="card final-vote">
    <h2><Icon name="vote" /> 최종 투표</h2>
    <template v-if="myVote">
      <p class="done-msg">
        <span class="badge on">투표 완료</span>
        <strong><Icon :name="myVote.choice" /> {{ RESOURCE_LABELS[myVote.choice] }}</strong>
        · {{ myVote.weight }}표{{ myVote.extra ? ' (라이프 투표권 사용)' : '' }}
      </p>
      <p class="muted">{{ final.closed ? '투표가 마감되었습니다. 결과 발표를 기다리세요.' : `투표 ${final.votes.done} / ${final.votes.eligible}명 · 진행자가 마감하면 결과가 공개됩니다.` }}</p>
    </template>
    <p v-else-if="final.closed" class="muted">투표가 마감되었습니다 (기권). 결과 발표를 기다리세요.</p>
    <template v-else>
      <p v-if="granted" class="granted"><Icon name="vote" /> 라이프 투표권에 뽑혔습니다. 내 표는 2표로 계산됩니다.</p>
      <p class="muted">상금이 될 화폐에 투표하세요. 비밀 투표이며 한 번 내면 바꿀 수 없습니다. 화폐로 표를 살 수 없습니다.</p>
      <div class="choices">
        <button class="choice" :class="{ on: picked === 'gem' }" :disabled="busy" @click="picked = 'gem'"><Icon name="gem" /> 보석</button>
        <button class="choice" :class="{ on: picked === 'gold' }" :disabled="busy" @click="picked = 'gold'"><Icon name="gold" /> 골드</button>
      </div>
      <FixedBottomCta rules :label="picked ? `${RESOURCE_LABELS[picked]}에 투표하기` : '투표하기'" :disabled="!picked" :busy="busy" :hint="picked ? undefined : '보석 또는 골드를 먼저 골라 주세요'" @click="confirmOpen = true" />
      <p class="muted" style="margin: 8px 0 0">투표 {{ final.votes.done }} / {{ final.votes.eligible }}명</p>
    </template>
    <p v-if="error" class="error">{{ error }}</p>
    <ModalDialog
      :open="confirmOpen"
      title="정말로 투표하시겠습니까?"
      :message="confirmText"
      confirm-label="투표"
      cancel-label="닫기"
      :busy="busy"
      @confirm="submit"
      @cancel="confirmOpen = false"
    />
  </div>
</template>

<style scoped>
.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
.choice { font-size: 1.4rem; padding: 22px 12px; background: var(--bg-soft); color: var(--ink); border: 2px solid transparent; border-radius: var(--radius-card); min-height: 0; }
.choice:hover { background: #e5e8eb; }
.choice.on { border-color: var(--blue); background: var(--blue-bg); color: var(--blue-600); }
.done-msg { font-size: 1.1rem; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.granted { margin: 0 0 8px; font-weight: 700; }
</style>
