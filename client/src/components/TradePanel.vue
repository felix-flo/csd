<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 거래 (거래 단계, docs/103 §10). 거래는 오프라인에서 협의하고 진행자 앞에서 진행한다.
 * 진행자가 내용을 입력해 올리면 두 팀 리더 화면에 요약이 강조 박스로 뜨고, 리더가 "예" 를 누르면 수락, 둘 다 수락하면
 * 크레딧(내는 팀) 1개 차감 + 재화 교환. 한쪽이라도 "아니오" 면 거래 취소 (진행자가 다시 올린다). 팀원은 요약만 본다.
 */
import { computed, ref } from 'vue'
import { RESOURCE_KINDS, RESOURCE_LABELS, type Resources, type TradeView } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
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
/** 오가는 재화를 재화별로 한 줄씩. 시트가 재화 영역을 가릴 수 있어 우리 팀 보유량을 함께 보여 준다 (docs/107) */
function offerRows(label: string, o: Resources | null | undefined) {
  const mine = game.team?.resources
  const rows = RESOURCE_KINDS.filter((k) => (o?.[k] ?? 0) > 0).map((k, i) => ({
    key: k,
    label: i === 0 ? label : '',
    text: `${RESOURCE_LABELS[k]} ${o![k].toLocaleString('ko-KR')}`,
    hold: mine ? `보유 ${mine[k].toLocaleString('ko-KR')}` : '',
  }))
  return rows.length ? rows : [{ key: 'none', label, text: '없음', hold: '' }]
}
const rows = computed(() => [...offerRows('우리가 줌', mySide.value?.offer), ...offerRows('우리가 받음', theirSide.value?.offer).map((r) => ({ ...r, key: `in-${r.key}` }))])

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
  <div class="card">
    <h2>{{ isLeader && awaitingMe ? '거래 확인' : '거래 현황' }}<template v-if="partner"> · {{ partner.name }}</template></h2>

    <p v-if="!trade && warActive" class="hint war-block"><Icon name="war" /> 전쟁 중에는 거래할 수 없습니다. 진행자가 결과를 정하면 다시 거래할 수 있습니다.</p>
    <p v-else-if="!trade" class="hint">거래는 오프라인에서 협의한 뒤 <strong>진행자에게 가서</strong> 진행합니다. 진행자가 거래를 올리면 여기에 내용이 뜹니다.</p>

    <template v-else>
      <div class="lines">
        <div v-for="r in rows" :key="r.key" class="line"><span>{{ r.label }}</span>{{ r.text }}<em>{{ r.hold }}</em></div>
        <div class="line"><span>수수료</span>크레딧 1개 · {{ iPay ? '우리 팀' : payerName }} 부담</div>
      </div>
      <template v-if="isLeader && awaitingMe">
        <p class="hint">협의한 내용과 맞는지 확인하세요. 두 팀 리더가 모두 "예"를 누르면 바로 체결됩니다.<template v-if="theirSide?.accepted"> 상대 리더는 이미 수락했습니다.</template></p>
        <div class="acts">
          <button class="secondary" type="button" :disabled="busy" @click="confirm = 'reject'">아니오</button>
          <button class="go" type="button" :disabled="busy" @click="confirm = 'accept'">예, 거래합니다</button>
        </div>
      </template>
      <p v-else-if="isLeader" class="hint">우리 팀은 수락했습니다. 상대 리더의 수락을 기다리는 중입니다.</p>
      <p v-else class="hint">리더가 확인하는 중입니다.</p>
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
.war-block { color: #ff6b6b; }
</style>
