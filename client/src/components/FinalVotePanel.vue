<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 최종 투표 (참가자, docs/100 N2). 비밀·동시 투표: 보석 / 골드 중 하나.
 * - 기본 1표는 리더만 (2026-10-30 결정). 안건 부결이면 팀원은 투표하지 않는다
 * - 라이프 투표권 안건이 통과됐으면 팀 라이프 1개로 1표 (선착순, 1인 1장): 리더는 체크해서 +1표, 팀원은 이것으로만 투표 (체크 고정)
 * - 확인 팝업 뒤 확정. 한 번 내면 바꿀 수 없다 (서버도 already_voted 로 거부)
 * - 득표는 진행자가 마감할 때까지 아무도 볼 수 없고, 투표한 사람 수만 보인다
 */
import { computed, ref } from 'vue'
import { RESOURCE_LABELS, type FinalState } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
import { useGameStore } from '../stores/game'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
  final: FinalState
  lifeVote: boolean
  teamLives: number
  myVote: { choice: 'gem' | 'gold'; extra: boolean; weight: number } | null
  isLeader: boolean
}>()
const game = useGameStore()
const picked = ref<'gem' | 'gold' | null>(null)
const extra = ref(false)
const busy = ref(false)
const error = ref('')
const confirmOpen = ref(false)
const canExtra = computed(() => props.lifeVote && props.teamLives > 0)
/** 팀원: 안건 통과 시 라이프 투표권으로만 투표 (체크 고정). 부결이면 투표 없음 */
const memberOnlyLife = computed(() => !props.isLeader && props.lifeVote)
const cannotVote = computed(() => (!props.isLeader && !props.lifeVote) || (memberOnlyLife.value && !canExtra.value))
const useExtra = computed(() => memberOnlyLife.value || (extra.value && canExtra.value))
const weight = computed(() => (props.isLeader ? 1 : 0) + (useExtra.value ? 1 : 0))

const confirmText = computed(() => {
  if (!picked.value) return ''
  const votes = useExtra.value ? `${weight.value}표 (라이프 투표권 사용: 팀 라이프 1개 소모)` : '1표'
  return `${RESOURCE_LABELS[picked.value]}에 ${votes}를 던집니다. 한 번 내면 바꿀 수 없습니다.`
})

async function submit() {
  if (!picked.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await api.post<{ vote: { choice: 'gem' | 'gold'; extra: boolean; weight: number } }>('/api/final/vote', { choice: picked.value, extra: useExtra.value })
    if (game.team) game.team.myFinalVote = res.vote
  } catch (e) {
    error.value = e instanceof ApiError && e.detail ? e.detail : `실패: ${(e as Error).message}`
    extra.value = false
  } finally {
    busy.value = false
    confirmOpen.value = false
    void game.load()
  }
}
</script>

<template>
  <div class="card">
    <h2>최종 투표</h2>
    <template v-if="myVote">
      <div class="lines">
        <div class="line"><span>투표 완료</span><Icon :name="myVote.choice" />{{ RESOURCE_LABELS[myVote.choice] }}<em>{{ myVote.weight }}표{{ myVote.extra ? ' · 라이프 투표권' : '' }}</em></div>
      </div>
      <p class="hint">{{ final.closed ? '투표가 마감되었습니다. 결과 발표를 기다리세요.' : `투표 ${final.votes.done} / ${final.votes.eligible}명 · 진행자가 마감하면 결과가 공개됩니다.` }}</p>
    </template>
    <p v-else-if="final.closed" class="hint">투표가 마감되었습니다{{ isLeader || lifeVote ? ' (기권)' : '' }}. 결과 발표를 기다리세요.</p>
    <template v-else-if="cannotVote">
      <p v-if="!lifeVote" class="hint">라이프 투표권 안건이 부결되어 <strong>리더만</strong> 투표합니다. 팀 리더가 우리 팀의 1표를 던집니다.</p>
      <p v-else class="hint">팀원은 라이프 투표권(팀 라이프 1개)으로 투표하는데, 팀 라이프가 남아 있지 않아 투표할 수 없습니다.</p>
      <p class="hint">투표 {{ final.votes.done }} / {{ final.votes.eligible }}명</p>
    </template>
    <template v-else>
      <p class="hint">상금이 될 화폐에 투표하세요. 비밀 투표이며 한 번 내면 바꿀 수 없습니다. 화폐로 표를 살 수 없습니다.</p>
      <p v-if="memberOnlyLife" class="hint">팀원은 <strong>라이프 투표권</strong>으로 투표합니다. 투표하면 팀 라이프 1개가 소모됩니다 (남은 팀 라이프 {{ teamLives }}).</p>
      <div class="picks">
        <button class="pick choice" type="button" :class="{ on: picked === 'gem' }" :disabled="busy" @click="picked = 'gem'"><Icon name="gem" />보석</button>
        <button class="pick choice" type="button" :class="{ on: picked === 'gold' }" :disabled="busy" @click="picked = 'gold'"><Icon name="gold" />골드</button>
      </div>
      <label v-if="lifeVote && isLeader" class="extra" :class="{ off: !canExtra }">
        <input v-model="extra" type="checkbox" :disabled="busy || !canExtra" />
        <span>라이프 투표권 사용 (+1표)<small>{{ canExtra ? `팀 라이프 1개 소모 · 남은 팀 라이프 ${teamLives}` : '팀 라이프가 남아 있지 않습니다' }}</small></span>
      </label>
      <button class="wide" type="button" :disabled="busy || !picked" @click="confirmOpen = true">{{ picked ? '투표하기' : '보석 또는 골드를 고르세요' }}</button>
      <p class="hint">투표 {{ final.votes.done }} / {{ final.votes.eligible }}명</p>
    </template>
    <p v-if="error" class="error">{{ error }}</p>
    <ModalDialog
      :open="confirmOpen"
      title="정말로 투표하시겠습니까?"
      :message="confirmText"
      confirm-label="투표"
      cancel-label="취소"
      :busy="busy"
      @confirm="submit"
      @cancel="confirmOpen = false"
    />
  </div>
</template>

<style scoped>
.choice, .choice:hover { height: 84px; font: 400 28px/1 var(--font-play); }
.choice :deep(.icon) { font-size: 30px; }
.extra { display: flex; gap: 10px; align-items: flex-start; margin-top: 12px; font-size: 16px; font-weight: 800; cursor: pointer; }
.extra input { flex: none; width: 22px; height: 22px; margin: 1px 0 0; }
.extra small { display: block; margin-top: 2px; font-size: 14px; font-weight: 600; }
.extra.off { opacity: 0.6; cursor: default; }
</style>
