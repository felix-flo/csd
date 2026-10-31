<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 거래 (거래 단계, docs/103 §10). 거래는 오프라인에서 협의하고 진행자 앞에서 진행한다.
 * 진행자가 내용을 입력해 올리면 두 팀 리더 화면에 요약이 강조 박스로 뜨고, 리더가 "예" 를 누르면 수락, 둘 다 수락하면
 * 크레딧(내는 팀) 1개 차감 + 재화 교환. 한쪽이라도 "아니오" 면 거래 취소 (진행자가 다시 올린다). 팀원은 요약만 본다.
 */
import { computed, ref } from 'vue'
import { RESOURCE_KINDS, RESOURCE_LABELS, josa, type Resources, type TradeView } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import TeamMark from './TeamMark.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ myTeamId: number; isLeader: boolean; trade: TradeView | null }>()
const game = useGameStore()
const teams = useTeamsStore()
const busy = ref(false)
const error = ref('')
const confirm = ref<'accept' | 'reject' | null>(null)

const warActive = computed(() => !!game.state?.war?.active)
const mySide = computed(() => (props.trade ? (props.trade.from.teamId === props.myTeamId ? props.trade.from : props.trade.to) : null))
const theirSide = computed(() => (props.trade ? (props.trade.from.teamId === props.myTeamId ? props.trade.to : props.trade.from) : null))
const partner = computed(() => teams.byId(theirSide.value?.teamId))
const payerName = computed(() => teams.byId(props.trade?.creditPayer)?.name ?? '')
const iPay = computed(() => props.trade?.creditPayer === props.myTeamId)
/** 내 리더의 수락을 기다리는 중 → 박스 강조 */
const awaitingMe = computed(() => !!props.trade && !mySide.value?.accepted)

function offerText(o: Resources | null | undefined): string {
  if (!o) return '없음'
  return RESOURCE_KINDS.filter((k) => o[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${o[k]}`).join(', ') || '없음 (0개)'
}

async function decide(accept: boolean) {
  if (!props.trade) return
  busy.value = true
  error.value = ''
  try {
    await api.post(`/api/trade/${props.trade.id}/decide`, { accept })
  } catch (e) {
    error.value = e instanceof ApiError && e.detail ? e.detail : (e as Error).message
  } finally {
    busy.value = false
    confirm.value = null
    void game.load()
  }
}
</script>

<template>
  <div class="card" :class="{ attention: awaitingMe && isLeader, pending: trade }">
    <h2><Icon name="aid" /> 거래 <span v-if="awaitingMe && isLeader" class="badge warn">수락 대기</span></h2>

    <p v-if="!trade && warActive" class="war-block"><Icon name="war" /> 전쟁 중에는 거래할 수 없습니다. 진행자가 결과를 정하면 다시 거래할 수 있습니다.</p>
    <p v-else-if="!trade" class="muted">거래는 오프라인에서 협의한 뒤 <strong>진행자에게 가서</strong> 진행합니다. 진행자가 거래를 올리면 여기에 내용이 뜹니다.</p>

    <template v-else>
      <p class="partner">
        <TeamMark :color="partner?.color ?? ''" /><strong>{{ partner?.name }}</strong>
        <span class="muted">{{ partner ? josa(partner.name, '와/과').slice(partner.name.length) : '' }} 거래</span>
      </p>
      <div class="summary">
        <div class="line"><span class="label">우리가 줌</span><strong>{{ offerText(mySide?.offer) }}</strong></div>
        <div class="line"><span class="label">우리가 받음</span><strong>{{ offerText(theirSide?.offer) }}</strong></div>
        <div class="line"><span class="label"><Icon name="credit" /> 수수료</span><span>크레딧 1개 · <strong>{{ payerName }}</strong> 부담{{ iPay ? ' (우리 팀)' : '' }}</span></div>
      </div>
      <p class="muted status">
        우리 팀 <span class="badge" :class="mySide?.accepted ? 'on' : 'warn'">{{ mySide?.accepted ? '수락함' : '대기' }}</span>
        · {{ partner?.name }} <span class="badge" :class="theirSide?.accepted ? 'on' : 'warn'">{{ theirSide?.accepted ? '수락함' : '대기' }}</span>
      </p>
      <template v-if="isLeader && awaitingMe">
        <p>위 내용이 협의한 것과 맞습니까? 두 팀 리더가 모두 "예" 를 누르면 바로 체결됩니다.</p>
        <div class="row">
          <button :disabled="busy" @click="confirm = 'accept'">예, 거래합니다</button>
          <button class="secondary" :disabled="busy" @click="confirm = 'reject'">아니오</button>
        </div>
      </template>
      <p v-else-if="isLeader" class="muted">상대 리더의 수락을 기다리는 중…</p>
      <p v-else class="muted">리더가 확인하는 중입니다.</p>
    </template>

    <p v-if="error" class="error">{{ error }}</p>

    <ModalDialog
      :open="confirm !== null"
      :title="confirm === 'accept' ? `${partner?.name ?? '상대 팀'}과 거래할까요?` : '거래를 거부할까요?'"
      :message="confirm === 'accept'
        ? `우리가 줌: ${offerText(mySide?.offer)}\n우리가 받음: ${offerText(theirSide?.offer)}\n크레딧 1개는 ${payerName}이(가) 냅니다.\n상대 리더도 수락하면 바로 체결되고 되돌릴 수 없습니다.`
        : '거부하면 이 거래는 취소됩니다. 다시 하려면 진행자가 새로 올려야 합니다.'"
      :confirm-label="confirm === 'accept' ? '예, 거래' : '거부'"
      cancel-label="돌아가기"
      :danger="confirm === 'reject'"
      :busy="busy"
      @confirm="decide(confirm === 'accept')"
      @cancel="confirm = null"
    />
  </div>
</template>

<style scoped>
.war-block { color: var(--red); font-weight: 600; margin: 0; }
.partner { font-size: 1.05rem; margin: 0 0 8px; }
.summary { border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 8px 12px; display: grid; gap: 6px; }
.line { display: flex; gap: 10px; align-items: baseline; font-size: 1.05rem; }
.line .label { color: var(--muted); font-size: 0.85rem; min-width: 5.5em; }
.status { margin: 8px 0; }
/* 내 리더의 수락을 기다리는 거래: 강조 테두리 + 깜빡임 */
.card.pending { border-left: 3px solid var(--blue); }
.card.attention { border: 2px solid var(--blue); border-left-width: 6px; box-shadow: 0 0 0 4px var(--blue-bg); animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 var(--blue-bg); } 50% { box-shadow: 0 0 0 8px var(--blue-bg); } }
</style>
