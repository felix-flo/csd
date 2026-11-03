<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 생산게임 결과 입력 (관리자, 생산게임 단계의 "지금 할 일").
 * 팀 · 선택(라이프/크레딧) · 재도전 판수 · 이긴 횟수만 넣으면 팀별 보상 규칙(PRODUCTION_RATES)으로 계산해
 * 크레딧 차감과 보상을 한 번에 반영한다. 라운드마다 팀당 1번 (고칠 때는 팀 재화의 정정)
 */
import { computed, ref } from 'vue'
import type { GroupInfo } from '../../../shared/types'
import { PRODUCTION_BASE_PLAYS, PRODUCTION_MAX_EXTRA, PRODUCTION_RATES, RESOURCE_LABELS, productionResult, type ProductionMode } from '../../../shared/game'
import { api } from '../lib/api'
import { useGameStore } from '../stores/game'
import TeamPicker from './TeamPicker.vue'

const props = defineProps<{ groups: GroupInfo[] }>()
const game = useGameStore()
const view = computed(() => game.admin)
const team = (id: number) => props.groups.find((g) => g.id === id)

const busy = ref(false)
const status = ref('')
const prodTeam = ref<number | null>(null)
const prodMode = ref<ProductionMode>('life')
const prodExtra = ref(0)
const prodWins = ref<number | null>(null)
/** 이번 라운드 생산을 이미 입력한 팀 */
const done = computed(() => {
  const day = view.value?.state.day
  return new Set((view.value?.ledger ?? []).filter((l) => l.reason === 'production' && l.day === day).map((l) => l.teamId))
})
const result = computed(() =>
  prodTeam.value && prodWins.value != null && prodWins.value >= 0
    ? productionResult(team(prodTeam.value)?.code, prodMode.value, prodExtra.value || 0, prodWins.value)
    : null,
)
const rate = computed(() => {
  const r = PRODUCTION_RATES[team(prodTeam.value ?? 0)?.code ?? '']?.[prodMode.value]
  return r ? `${r[0]}승마다 ${r[1]}` : ''
})
const preview = computed(() => {
  const r = result.value
  if (!r) return ''
  // 크레딧을 고르면 받는 것과 내는 것이 같은 재화라 합친 값도 보여 준다
  if (prodMode.value === 'credit') return `${r.plays}판 ${prodWins.value}승 → 크레딧 +${r.reward} −${r.cost} = ${r.reward - r.cost >= 0 ? '+' : '−'}${Math.abs(r.reward - r.cost)}`
  return `${r.plays}판 ${prodWins.value}승 → ${RESOURCE_LABELS[prodMode.value]} +${r.reward} · 크레딧 −${r.cost}`
})
async function apply() {
  if (!prodTeam.value || !result.value) return
  busy.value = true
  status.value = ''
  const label = `${team(prodTeam.value)?.name} 반영: ${preview.value}`
  try {
    game.setAdmin(await api.post('/api/admin/game/production', { teamId: prodTeam.value, mode: prodMode.value, extra: prodExtra.value || 0, wins: prodWins.value }))
    status.value = label
    prodTeam.value = null
    prodExtra.value = 0
    prodWins.value = null
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="prod" @submit.prevent="apply">
    <div class="field">
      <p class="lbl">팀 <span class="muted">✓ = 이번 라운드 입력함</span></p>
      <TeamPicker v-model="prodTeam" :teams="groups" :done-ids="done" />
    </div>
    <div class="field">
      <p class="lbl">선택 재화</p>
      <div class="seg" role="group" aria-label="선택 재화">
        <button type="button" :aria-pressed="prodMode === 'life'" @click="prodMode = 'life'"><Icon name="life" /> 라이프</button>
        <button type="button" :aria-pressed="prodMode === 'credit'" @click="prodMode = 'credit'"><Icon name="credit" /> 크레딧</button>
      </div>
    </div>
    <div class="field">
      <p class="lbl">재도전 횟수 <span class="muted">1판에 크레딧 1</span></p>
      <div class="seg" role="group" aria-label="재도전 횟수">
        <button v-for="n in PRODUCTION_MAX_EXTRA + 1" :key="n" type="button" :aria-pressed="prodExtra === n - 1" @click="prodExtra = n - 1">{{ n - 1 }}판</button>
      </div>
    </div>
    <div class="field">
      <p class="lbl">이긴 횟수 <span class="muted">{{ PRODUCTION_BASE_PLAYS + (prodExtra || 0) }}판 중</span></p>
      <input v-model.number="prodWins" class="wins" type="number" min="0" :max="PRODUCTION_BASE_PLAYS + (prodExtra || 0)" placeholder="이긴 판 수" />
    </div>

    <div class="foot">
      <p v-if="prodTeam && done.has(prodTeam)" class="muted">{{ team(prodTeam)?.name }}은 이번 라운드 생산을 이미 입력했습니다. 고치려면 팀 재화의 정정으로 입력하세요.</p>
      <p v-else-if="preview" class="sum"><strong>{{ team(prodTeam ?? 0)?.name }} · {{ preview }}</strong><span class="muted">{{ RESOURCE_LABELS[prodMode] }} {{ rate }} · 크레딧은 참가비 1 + 재도전 {{ prodExtra || 0 }}</span></p>
      <p v-else-if="prodTeam && prodWins != null" class="error">이긴 횟수가 {{ PRODUCTION_BASE_PLAYS + (prodExtra || 0) }}판보다 많습니다</p>
      <p v-else class="muted">팀과 이긴 횟수를 넣으면 보상과 크레딧 차감을 자동으로 계산합니다.</p>
      <button type="submit" :disabled="busy || !result || (prodTeam != null && done.has(prodTeam))">{{ prodTeam ? `${team(prodTeam)?.name}에 반영` : '반영' }}</button>
      <p v-if="status" class="muted">{{ status }}</p>
    </div>
  </form>
</template>

<style scoped>
.prod { display: flex; flex-direction: column; gap: 16px; max-width: 560px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field > .team-picker { flex: none; }
.lbl { margin: 0; font-size: 0.88rem; font-weight: 700; color: var(--ink-2); }
.lbl .muted { margin-left: 4px; font-weight: 400; font-size: 0.8rem; }
.seg { display: inline-flex; align-self: flex-start; border-radius: var(--radius); box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; }
.seg button { min-width: 64px; min-height: 40px; padding: 0 16px; background: var(--bg-soft); color: var(--ink); border-radius: 0; font-size: 0.92rem; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
.seg button + button { box-shadow: inset 1px 0 0 var(--line); }
.seg button:hover { background: #e6e4dd; }
.seg button[aria-pressed='true'] { background: var(--ink); color: #fff; font-weight: 700; box-shadow: none; }
.wins { width: 10em; }
.foot { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid var(--line-soft); }
.foot p { margin: 0; }
.sum { display: flex; flex-direction: column; gap: 2px; }
.sum strong { font-size: 1.05rem; }
.sum .muted { font-size: 0.85rem; }
.foot button { align-self: flex-start; min-width: 240px; min-height: 44px; padding: 0 24px; }
</style>
