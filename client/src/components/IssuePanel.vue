<script setup lang="ts">
/**
 * 보석·골드 발행 요청 (화이트팀 = 보석, 옐로우팀 = 골드). 요청은 리더만, 팀원은 진행 상황만 본다.
 * 수량 입력 → "발행 요청" → 확인 팝업 → 확정하면 되돌릴 수 없다 → 관리자가 수락하면 팀 재화에 더해진다.
 * 게임 진행 중이면 원하는 때 요청할 수 있고, 라운드(일차)당 수락된 발행 1회 (거절되면 다시 요청 가능. docs/100 D3).
 * 남은 발행 가능량은 대기 중 요청도 뺀 값이다.
 * 마지막 라운드에는 관리자가 정한 단계에서만 요청할 수 있고, 발행량은 공개되지 않는다 (docs/100 D4).
 */
import { computed, ref } from 'vue'
import { ISSUE_STATUS_LABELS, PHASE_LABELS, RESOURCE_LABELS, type TeamIssueView } from '../../../shared/game'
import { RESOURCE_BY_KEY } from '../lib/resources'
import { api, ApiError } from '../lib/api'
import { useGameStore } from '../stores/game'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ issue: TeamIssueView; isLeader: boolean }>()
const game = useGameStore()
const amount = ref<number | null>(null)
const busy = ref(false)
const error = ref('')
const confirmOpen = ref(false)

const label = computed(() => RESOURCE_LABELS[props.issue.kind])
const emoji = computed(() => RESOURCE_BY_KEY[props.issue.kind].emoji)
const valid = computed(() => Number.isInteger(amount.value) && amount.value! >= 1 && amount.value! <= props.issue.remaining)
const canRequest = computed(() => props.isLeader && props.issue.open && !props.issue.issuedToday && !props.issue.pending && props.issue.remaining > 0)
const hint = computed(() => {
  if (props.issue.pending) return '진행자의 수락을 기다리는 요청이 있습니다.'
  // 마지막 라운드 허용 단계 안내는 위 배너가 보여 준다
  if (!props.issue.open) return props.issue.lastRoundPhases ? '' : '게임이 진행 중일 때 발행을 요청할 수 있습니다.'
  if (props.issue.issuedToday) return '이번 라운드 발행을 마쳤습니다. 발행은 라운드당 1회입니다.'
  if (props.issue.remaining <= 0) return '이번 일차에는 더 발행할 수 없습니다.'
  return props.isLeader ? '' : '리더가 발행을 요청할 수 있습니다.'
})
const lastPhases = computed(() => (props.issue.lastRoundPhases ?? []).map((p) => PHASE_LABELS[p]).join(', '))
const carryNote = computed(() => (props.issue.kind === 'gold' ? '안 쓴 만큼 다음 일차로 이월됩니다.' : '일차마다 새로 정해지며 이월되지 않습니다.'))

async function submit() {
  if (!valid.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await api.post<{ issue: TeamIssueView }>('/api/issue/request', { amount: amount.value })
    if (game.team) game.team.issue = res.issue
    amount.value = null
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
  <div class="card">
    <h2>{{ emoji }} {{ label }} 발행</h2>
    <p class="remain">
      이번 일차 남은 발행 가능량 <strong>{{ issue.remaining }}</strong>개
      <span class="muted">· {{ carryNote }}</span>
    </p>

    <p v-if="issue.lastRoundPhases" class="warn-note">
      🔒 마지막 라운드: <strong>{{ lastPhases }}</strong> 단계에서만 발행할 수 있습니다. 이번 발행량은 공개되지 않습니다.
    </p>

    <p v-if="issue.pending" class="pending">
      <span class="badge warn">수락 대기</span>
      {{ label }} <strong>{{ issue.pending.amount }}</strong>개 발행을 요청했습니다. 진행자가 수락하면 팀 재화에 더해집니다.
    </p>

    <p v-if="canRequest" class="muted once">발행은 라운드당 1회입니다. 진행자가 거절하면 다시 요청할 수 있습니다.</p>
    <form v-if="canRequest" class="row" @submit.prevent="valid && (confirmOpen = true)">
      <input v-model.number="amount" type="number" min="1" :max="issue.remaining" :placeholder="`1 ~ ${issue.remaining}`" style="width: 8em" />
      <span>개</span>
      <button type="submit" :disabled="busy || !valid">발행 요청</button>
    </form>
    <p v-else-if="hint && !issue.pending" class="muted">{{ hint }}</p>
    <p v-if="error" class="error">{{ error }}</p>

    <ul v-if="issue.recent.length" class="history">
      <li v-for="r in issue.recent" :key="r.id">
        <span class="muted">{{ r.day }}일차</span>
        {{ label }} {{ r.amount }}개
        <span class="badge" :class="{ on: r.status === 'approved', warn: r.status === 'pending', off: r.status === 'rejected' || r.status === 'cancelled' }">
          {{ ISSUE_STATUS_LABELS[r.status] }}
        </span>
      </li>
    </ul>

    <ModalDialog
      :open="confirmOpen"
      :title="`${label} 발행을 요청할까요?`"
      :message="`${label} ${amount ?? 0}개 발행을 진행자에게 요청합니다.\n요청한 뒤에는 되돌릴 수 없습니다.`"
      confirm-label="발행 요청"
      cancel-label="취소"
      :busy="busy"
      @confirm="submit"
      @cancel="confirmOpen = false"
    />
  </div>
</template>

<style scoped>
.remain { margin: 0 0 10px; }
.remain strong { font-size: 1.2rem; }
.pending { margin: 0 0 10px; }
.history { list-style: none; padding: 0; margin: 12px 0 0; font-size: 0.9rem; }
.history li { padding: 3px 0; border-top: 1px solid var(--line-soft); display: flex; gap: 8px; align-items: center; }
.error { margin: 8px 0 0; }
.once { margin: 0 0 8px; font-size: 0.85rem; }
.warn-note { margin: 0 0 10px; color: var(--amber, #b7791f); }
</style>
