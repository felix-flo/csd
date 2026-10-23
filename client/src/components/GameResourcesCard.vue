<script setup lang="ts">
/**
 * 팀 재화 (관리자, 게임 시작 후): 현재 보유량, 생산·정정 입력, 대가 없는 원조(게임 전체 1회), 변동 이력.
 * - 생산 라이프는 남은 라이프 매장량 안에서만 (서버도 검사). 정정은 매장량과 무관.
 * - 0 미만이 되는 입력은 서버가 거부한다.
 */
import { computed, reactive, ref } from 'vue'
import type { GroupInfo } from '../../../shared/types'
import { LEDGER_REASON_LABELS, RESOURCE_KINDS, RESOURCE_LABELS, emptyResources, isBeforeStart, type AdminGameView, type Resources } from '../../../shared/game'
import { RESOURCES } from '../lib/resources'
import { api } from '../lib/api'
import { useGameStore } from '../stores/game'
import TeamMark from './TeamMark.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ groups: GroupInfo[] }>()
const game = useGameStore()
const view = computed(() => game.admin)
const team = (id: number) => props.groups.find((g) => g.id === id)

const busy = ref(false)
const status = ref('')

async function run(label: string, fn: () => Promise<AdminGameView>): Promise<boolean> {
  busy.value = true
  status.value = ''
  try {
    game.setAdmin(await fn())
    status.value = label
    return true
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
    return false
  } finally {
    busy.value = false
  }
}

// ---- 생산 / 정정 ----
const adjTeam = ref<number | null>(null)
const adj = reactive<Resources>(emptyResources())
const reason = ref<'production' | 'correction'>('production')
const adjText = computed(() =>
  RESOURCE_KINDS.filter((k) => adj[k]).map((k) => `${RESOURCE_LABELS[k]} ${adj[k] > 0 ? '+' : ''}${adj[k]}`).join(', '),
)
async function applyAdjust() {
  if (!adjTeam.value || !adjText.value) return
  const name = team(adjTeam.value)?.name
  const ok = await run(`${name} ${reason.value === 'production' ? '생산' : '정정'}: ${adjText.value}`, () =>
    api.post('/api/admin/game/resources', { teamId: adjTeam.value, deltas: { ...adj }, reason: reason.value }),
  )
  if (ok) Object.assign(adj, emptyResources())
}

// ---- 원조 ----
const aidFrom = ref<number | null>(null)
const aidTo = ref<number | null>(null)
const aid = reactive<Resources>(emptyResources())
const aidConfirm = ref(false)
const aidText = computed(() => RESOURCE_KINDS.filter((k) => aid[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${aid[k]}`).join(', '))
async function applyAid() {
  const ok = await run('원조 처리됨', () => api.post('/api/admin/game/aid', { fromTeamId: aidFrom.value, toTeamId: aidTo.value, amounts: { ...aid } }))
  aidConfirm.value = false
  if (ok) Object.assign(aid, emptyResources())
}
</script>

<template>
  <div v-if="view && !isBeforeStart(view.state.status)" class="card">
    <h2>팀 재화</h2>
    <table class="tbl">
      <thead>
        <tr>
          <th>팀</th>
          <th v-for="r in RESOURCES" :key="r.key">{{ r.emoji }} {{ r.label }}</th>
          <th>팀원</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in view.teams" :key="t.teamId">
          <td><TeamMark :color="team(t.teamId)?.color ?? ''" />{{ team(t.teamId)?.name }}</td>
          <td v-for="k in RESOURCE_KINDS" :key="k" class="mono">
            <strong>{{ t.resources[k] }}</strong>
          </td>
          <td class="mono">{{ t.activeMembers }}명</td>
        </tr>
      </tbody>
    </table>
    <p class="muted" style="margin: 6px 0 0">현재 보유량. 남은 라이프 매장량 <strong class="mono">{{ view.lifeReserve }}</strong></p>

    <h3>생산 · 정정</h3>
    <form class="row" @submit.prevent="applyAdjust">
      <select v-model="adjTeam" required>
        <option :value="null" disabled>팀 선택</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
      <label v-for="r in RESOURCES" :key="r.key" class="row" style="gap: 4px">
        {{ r.emoji }} <input v-model.number="adj[r.key]" type="number" style="width: 5em" :title="`${r.label} 증감 (음수 = 차감)`" />
      </label>
      <label class="row" style="gap: 4px"><input v-model="reason" type="radio" value="production" /> 생산</label>
      <label class="row" style="gap: 4px"><input v-model="reason" type="radio" value="correction" /> 정정</label>
      <button type="submit" :disabled="busy || !adjTeam || !adjText">적용</button>
    </form>
    <p class="muted" style="margin: 4px 0 0">증감으로 입력합니다 (음수 = 차감). 팀원에게 "생산: 보석 +3" 처럼 알림이 갑니다.</p>

    <h3>대가 없는 원조 <span class="muted">게임 전체 1회</span></h3>
    <p v-if="view.aidUsed" class="muted">이미 사용했습니다.</p>
    <form v-else class="row" @submit.prevent="aidConfirm = true">
      <select v-model="aidFrom" required>
        <option :value="null" disabled>주는 팀</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
      →
      <select v-model="aidTo" required>
        <option :value="null" disabled>받는 팀</option>
        <option v-for="g in groups" :key="g.id" :value="g.id" :disabled="g.id === aidFrom">{{ g.name }}</option>
      </select>
      <label v-for="r in RESOURCES" :key="r.key" class="row" style="gap: 4px">
        {{ r.emoji }} <input v-model.number="aid[r.key]" type="number" min="0" style="width: 5em" />
      </label>
      <button type="submit" :disabled="busy || view.state.status !== 'running' || !aidFrom || !aidTo || !aidText">원조 처리</button>
    </form>
    <!-- 제재(대가 없는 제재: 한 팀의 다음날 하루 거래 금지)는 차후 이 자리에 추가 -->

    <p class="muted" style="min-height: 1.2em">{{ status }}</p>

    <details>
      <summary>변동 이력 (최근 {{ view.ledger.length }}건)</summary>
      <table class="tbl ledger">
        <tbody>
          <tr v-for="l in view.ledger" :key="l.id">
            <td class="mono muted">{{ l.day }}일차</td>
            <td><TeamMark :color="team(l.teamId)?.color ?? ''" />{{ team(l.teamId)?.name }}</td>
            <td>{{ LEDGER_REASON_LABELS[l.reason] }}</td>
            <td class="mono">{{ RESOURCE_LABELS[l.kind] }} {{ l.delta > 0 ? '+' : '' }}{{ l.delta }} → {{ l.amountAfter }}</td>
            <td class="mono muted">{{ l.createdAt.slice(11, 19) }}</td>
          </tr>
        </tbody>
      </table>
    </details>

    <ModalDialog
      :open="aidConfirm"
      title="원조를 처리할까요?"
      :message="`${team(aidFrom ?? 0)?.name} → ${team(aidTo ?? 0)?.name}: ${aidText}\n원조는 게임 전체에서 1회만 가능합니다.`"
      confirm-label="처리"
      cancel-label="취소"
      :busy="busy"
      @confirm="applyAid"
      @cancel="aidConfirm = false"
    />
  </div>
</template>

<style scoped>
h3 { font-size: 0.95rem; margin: 16px 0 6px; font-weight: 600; }
h3 .muted { font-weight: 400; font-size: 0.8rem; }
.tbl { border-collapse: collapse; font-size: 0.92rem; }
.tbl th, .tbl td { text-align: left; padding: 5px 12px 5px 0; border-bottom: 1px solid var(--line-soft); vertical-align: middle; white-space: nowrap; }
.tbl th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
.ledger { margin-top: 6px; font-size: 0.85rem; }
summary { cursor: pointer; color: var(--muted); font-size: 0.9rem; }
</style>
