<script setup lang="ts">
/**
 * 거래 (거래 활동 단계). 조작은 리더만, 팀원은 진행 상황만 본다.
 * 요청 → 상대 리더 수락 → 두 팀 중 먼저 낸 팀이 크레딧 1개 → 서로 줄 재화를 "제안" → 양쪽 다 "수락" 하면 완료.
 * 다른 팀끼리 거래 중이면 요청할 때 "다른 팀이 거래중입니다" 팝업.
 * 제안할 재화는 −/+ 버튼 또는 숫자 직접 입력. 입력은 0 이상 정수만(숫자 외 문자는 지움), 보유량을 넘으면 보유량으로 바꾼다.
 * 입력 중 보유량이 줄면 입력값도 낮춘다. 서버도 정수·음수·보유량 초과를 다시 검사한다.
 */
import { computed, reactive, ref, watch } from 'vue'
import { RESOURCE_KINDS, RESOURCE_LABELS, emptyResources, josa, type Resources, type TradeView } from '../../../shared/game'
import { RESOURCES } from '../lib/resources'
import { api, ApiError } from '../lib/api'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import TeamMark from './TeamMark.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ myTeamId: number; isLeader: boolean; trade: TradeView | null; resources: Resources }>()
const game = useGameStore()
const teams = useTeamsStore()
const busy = ref(false)
const error = ref('')
const popup = ref<{ title: string; message: string } | null>(null)

const others = computed(() => teams.teams.filter((t) => t.id !== props.myTeamId))
const warActive = computed(() => !!game.state?.war?.active)
const mySide = computed(() => (props.trade ? (props.trade.from.teamId === props.myTeamId ? props.trade.from : props.trade.to) : null))
const theirSide = computed(() => (props.trade ? (props.trade.from.teamId === props.myTeamId ? props.trade.to : props.trade.from) : null))
const partner = computed(() => teams.byId(theirSide.value?.teamId))
const iAmTarget = computed(() => props.trade?.to.teamId === props.myTeamId)
const bothProposed = computed(() => !!props.trade?.from.offer && !!props.trade?.to.offer)

const draft = reactive<Resources>(emptyResources())
/** 입력칸 아래 안내 (보유량으로 맞췄을 때) */
const notes = reactive<Partial<Record<keyof Resources, string>>>({})
// 내가 제안한 값이 있으면 편집기에 채운다 (다시 제안할 때 기준)
watch(() => mySide.value?.offer, (o) => {
  Object.assign(draft, o ?? emptyResources())
  // 제안이 반영되면 입력 안내(보유량으로 맞춤)는 지운다
  for (const k of RESOURCE_KINDS) delete notes[k]
}, { immediate: true })
const draftChanged = computed(() => !mySide.value?.offer || RESOURCE_KINDS.some((k) => draft[k] !== mySide.value!.offer![k]))

function offerText(o: Resources | null): string {
  if (!o) return '제안 전'
  return RESOURCE_KINDS.filter((k) => o[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${o[k]}`).join(', ') || '없음 (0개)'
}

const ERRORS: Record<string, { title: string; message: string }> = {
  trade_busy: { title: '다른 팀이 거래중입니다', message: '진행 중인 거래가 끝난 뒤 다시 요청하세요.' },
  war_active: { title: '전쟁 중입니다', message: '전쟁 결과가 나올 때까지 거래할 수 없습니다.' },
  war_pending: { title: '전쟁 선포 승인 대기 중', message: '진행자가 선포를 승인하거나 거절할 때까지 새 거래를 올릴 수 없습니다.' },
  credit_already_paid: { title: '상대 팀이 먼저 냈습니다', message: '상대 팀이 크레딧을 먼저 제출해 거래가 시작되었습니다.' },
}

async function act(path: string, body?: unknown) {
  busy.value = true
  error.value = ''
  try {
    await api.post(path, body)
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ''
    if (ERRORS[code]) popup.value = ERRORS[code]!
    else error.value = e instanceof ApiError && e.detail ? e.detail : (e as Error).message
  } finally {
    busy.value = false
    void game.load()
  }
}

const cancelConfirm = ref(false)
function step(k: keyof Resources, d: number) {
  draft[k] = Math.min(props.resources[k], Math.max(0, draft[k] + d))
  delete notes[k]
}

/** 숫자 입력: 숫자만 남기고(앞자리 0 정리), 보유량을 넘으면 보유량으로. 비우면 입력 중에는 빈칸, 칸을 벗어나면 0 */
const texts = reactive<Record<keyof Resources, string>>({ gem: '0', gold: '0', life: '0', credit: '0' })
watch(draft, () => {
  for (const k of RESOURCE_KINDS) if (!(texts[k] === '' && draft[k] === 0)) texts[k] = String(draft[k])
}, { immediate: true })
function onInput(k: keyof Resources, e: Event) {
  const el = e.target as HTMLInputElement
  let digits = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  let n = digits === '' ? 0 : Number(digits)
  const max = props.resources[k]
  if (n > max) {
    n = max
    digits = String(max)
    notes[k] = `보유량(${max})까지만 제안할 수 있습니다`
  } else delete notes[k]
  texts[k] = digits
  el.value = digits
  draft[k] = n
}
function onBlur(k: keyof Resources) {
  if (texts[k] === '') texts[k] = '0'
}
/** 숫자·편집 키 외에는 막는다 (-, ., e, + 등) */
function onKeydown(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.key.length > 1) return
  if (!/^[0-9]$/.test(e.key)) e.preventDefault()
}
// 입력 중 보유량이 줄면(정정·크레딧 소모 등) 입력값을 새 보유량으로 낮춘다
watch(() => ({ ...props.resources }), (r) => {
  for (const k of RESOURCE_KINDS) {
    if (draft[k] > r[k]) {
      draft[k] = r[k]
      notes[k] = `보유량이 줄어 ${r[k]}(으)로 맞췄습니다`
    }
  }
})
</script>

<template>
  <div class="card">
    <h2>거래</h2>

    <!-- 전쟁 중: 모든 팀 거래 금지 -->
    <p v-if="!trade && warActive" class="war-block">⚔️ 전쟁 중에는 거래할 수 없습니다. 진행자가 결과를 정하면 다시 거래할 수 있습니다.</p>

    <!-- 진행 중 거래 없음 -->
    <template v-else-if="!trade">
      <template v-if="isLeader">
        <p class="muted">거래할 팀을 고르세요. 상대 리더가 수락하면 두 팀 중 먼저 크레딧 1개를 낸 팀이 거래를 시작합니다.</p>
        <div class="teams">
          <button v-for="t in others" :key="t.id" class="secondary team-btn" :disabled="busy" @click="act('/api/trade/request', { toTeamId: t.id })">
            <TeamMark :color="t.color" />{{ t.name }}에 거래 요청
          </button>
        </div>
      </template>
      <p v-else class="muted">리더가 다른 팀에 거래를 요청할 수 있습니다. 진행 상황은 여기에 표시됩니다.</p>
    </template>

    <template v-else>
      <p class="partner">
        <TeamMark :color="partner?.color ?? ''" /><strong>{{ partner?.name }}</strong>
        <span class="muted">{{ partner ? josa(partner.name, '와/과').slice(partner.name.length) : '' }} 거래 · {{ iAmTarget ? '요청 받음' : '요청함' }}</span>
      </p>

      <!-- 요청 대기 -->
      <template v-if="trade.status === 'requested'">
        <template v-if="iAmTarget">
          <p>{{ josa(partner?.name ?? '상대 팀', '이/가') }} 거래를 요청했습니다.</p>
          <div v-if="isLeader" class="row">
            <button :disabled="busy" @click="act(`/api/trade/${trade.id}/respond`, { accept: true })">수락</button>
            <button class="secondary" :disabled="busy" @click="act(`/api/trade/${trade.id}/respond`, { accept: false })">거부</button>
          </div>
        </template>
        <template v-else>
          <p class="muted">상대 리더의 응답을 기다리는 중…</p>
          <button v-if="isLeader" class="secondary" :disabled="busy" @click="act(`/api/trade/${trade.id}/cancel`)">요청 취소</button>
        </template>
      </template>

      <!-- 크레딧 -->
      <template v-else-if="trade.status === 'awaiting_credit'">
        <p>거래를 시작하려면 두 팀 중 한 팀이 크레딧 1개를 내야 합니다. 먼저 낸 팀만 소모됩니다.</p>
        <div v-if="isLeader" class="row">
          <button :disabled="busy || resources.credit < 1" @click="act(`/api/trade/${trade.id}/credit`)">🎟️ 크레딧 1개 제출</button>
          <span class="muted">보유 {{ resources.credit }}</span>
          <button class="secondary" :disabled="busy" @click="cancelConfirm = true">거래 취소</button>
        </div>
      </template>

      <!-- 제안 · 수락 -->
      <template v-else-if="trade.status === 'negotiating'">
        <p class="muted">크레딧: {{ teams.byId(trade.creditPayer)?.name }} 제출 · 서로 줄 재화를 정해 "제안" 하고, 둘 다 제안하면 양쪽이 "수락" 해야 완료됩니다.</p>
        <div class="offers">
          <div class="offer">
            <div class="label">우리가 줄 것 <span v-if="mySide?.offer" class="badge on">제안함</span> <span v-if="mySide?.accepted" class="badge on">수락함</span></div>
            <template v-if="isLeader">
              <div v-for="r in RESOURCES" :key="r.key" class="stepper">
                <span>{{ r.emoji }} {{ r.label }} <span class="muted">/ {{ resources[r.key] }}</span></span>
                <span class="row" style="gap: 4px">
                  <button class="secondary sq" type="button" :disabled="busy || draft[r.key] <= 0" @click="step(r.key, -1)">−</button>
                  <input
                    class="mono num"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    autocomplete="off"
                    :aria-label="`${r.label} 제안 수량 (최대 ${resources[r.key]})`"
                    :value="texts[r.key]"
                    :disabled="busy"
                    @keydown="onKeydown"
                    @input="onInput(r.key, $event)"
                    @blur="onBlur(r.key)"
                    @focus="($event.target as HTMLInputElement).select()"
                  />
                  <button class="secondary sq" type="button" :disabled="busy || draft[r.key] >= resources[r.key]" @click="step(r.key, 1)">+</button>
                </span>
                <span v-if="notes[r.key]" class="note">{{ notes[r.key] }}</span>
              </div>
              <button style="margin-top: 8px" :disabled="busy || !draftChanged" @click="act(`/api/trade/${trade.id}/offer`, { offer: { ...draft } })">
                {{ mySide?.offer ? '다시 제안' : '제안' }}
              </button>
            </template>
            <p v-else>{{ offerText(mySide?.offer ?? null) }}</p>
          </div>
          <div class="offer">
            <div class="label">{{ josa(partner?.name ?? '상대 팀', '이/가') }} 줄 것 <span v-if="theirSide?.offer" class="badge on">제안함</span> <span v-if="theirSide?.accepted" class="badge on">수락함</span></div>
            <p class="big">{{ offerText(theirSide?.offer ?? null) }}</p>
          </div>
        </div>
        <div v-if="isLeader" class="row" style="margin-top: 10px">
          <button :disabled="busy || !bothProposed || mySide?.accepted || draftChanged && !!mySide?.offer" @click="act(`/api/trade/${trade.id}/accept`)">
            {{ mySide?.accepted ? '수락함 · 상대 대기 중' : '수락' }}
          </button>
          <button class="secondary" :disabled="busy" @click="cancelConfirm = true">거래 취소</button>
          <span v-if="!bothProposed" class="muted">양쪽 모두 제안해야 수락할 수 있습니다</span>
          <span v-else-if="draftChanged && mySide?.offer" class="muted">바꾼 내용을 먼저 다시 제안하세요</span>
        </div>
      </template>
    </template>

    <p v-if="error" class="error">{{ error }}</p>

    <ModalDialog :open="!!popup" :title="popup?.title ?? ''" :message="popup?.message" @confirm="popup = null" @cancel="popup = null" />
    <ModalDialog
      :open="cancelConfirm"
      title="거래를 취소할까요?"
      message="이미 낸 크레딧은 돌려받지 못합니다."
      confirm-label="거래 취소"
      cancel-label="계속 거래"
      danger
      :busy="busy"
      @confirm="cancelConfirm = false; act(`/api/trade/${trade!.id}/cancel`)"
      @cancel="cancelConfirm = false"
    />
  </div>
</template>

<style scoped>
.teams { display: grid; gap: 6px; }
.war-block { color: var(--red); font-weight: 600; margin: 0; }
.team-btn { text-align: left; padding: 12px 14px; font-size: 1rem; }
.partner { font-size: 1.05rem; margin: 0 0 8px; }
.offers { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 560px) { .offers { grid-template-columns: 1fr; } }
.offer { border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 10px; }
.offer .label { margin-bottom: 6px; }
.stepper { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; padding: 4px 0; }
.note { flex-basis: 100%; text-align: right; color: var(--amber, #b7791f); font-size: 0.8rem; }
.sq { width: 34px; height: 34px; padding: 0; font-size: 1.1rem; }
.num { width: 3.6em; text-align: center; font-size: 1.05rem; padding: 4px 6px; }
.big { font-size: 1.1rem; margin: 4px 0 0; }
</style>
