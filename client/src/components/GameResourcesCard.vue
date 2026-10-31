<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 팀 재화 (관리자, 게임 시작 후): 현재 보유량, 생산·정정 입력, 대가 없는 원조, 변동 이력.
 * - 생산·원조의 팀 선택은 고른 팀의 색으로 칠해 다른 팀에 잘못 넣는 실수를 막는다 (docs/103 §2)
 * - 원조는 리더 협의 단계에서만, 게임 전체 라운드당 1회 (docs/103 §11). 통과 조건(리더 4명 중 3명 찬성)은 안내 문구로
 * - 생산 라이프는 제한 없음 (매장량 폐지, docs/103 §3). 0 미만이 되는 입력은 서버가 거부한다.
 */
import { computed, reactive, ref } from 'vue'
import type { GroupInfo } from '../../../shared/types'
import { LEDGER_REASON_LABELS, RESOURCE_KINDS, RESOURCE_LABELS, emptyResources, isBeforeStart, type AdminGameView, type Resources } from '../../../shared/game'
import { RESOURCES } from '../lib/resources'
import { api } from '../lib/api'
import { useGameStore } from '../stores/game'
import { teamInk } from '../lib/teamColor'
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

/** 팀 선택 콤보박스·칩 색: 고른 팀의 색으로 테두리·글자를 칠한다 (흰색 팀은 테두리로만 구분되므로 배경을 살짝 어둡게) */
const teamStyle = (id: number | null) => {
  const c = teamInk(team(id ?? 0)?.color)
  return c ? { '--team': c } : {}
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
const aidPhase = computed(() => view.value?.state.status === 'running' && view.value.state.phase === 'council')
/** 이번 라운드에 원조가 이미 있었는지 (게임 전체 라운드당 1회) */
const aidUsed = computed(() => (view.value?.aidsToday.length ?? 0) > 0)
const amountText = (r: Resources) => RESOURCE_KINDS.filter((k) => r[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${r[k]}`).join(', ')
const aidText = computed(() => RESOURCE_KINDS.filter((k) => aid[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${aid[k]}`).join(', '))
async function applyAid() {
  const ok = await run('원조 처리됨', () => api.post('/api/admin/game/aid', { fromTeamId: aidFrom.value, toTeamId: aidTo.value, amounts: { ...aid } }))
  aidConfirm.value = false
  if (ok) {
    Object.assign(aid, emptyResources())
    aidFrom.value = null
    aidTo.value = null
  }
}
</script>

<template>
  <div v-if="view && !isBeforeStart(view.state.status)" class="card">
    <h2>팀 재화</h2>
    <table class="tbl">
      <thead>
        <tr>
          <th>팀</th>
          <th v-for="r in RESOURCES" :key="r.key"><Icon :name="r.key" /> {{ r.label }}</th>
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
    <p class="muted" style="margin: 6px 0 0">현재 보유량.</p>

    <h3>생산 · 정정</h3>
    <form class="row" @submit.prevent="applyAdjust">
      <span v-if="adjTeam" class="team-chip" :style="teamStyle(adjTeam)"><TeamMark :color="team(adjTeam)?.color ?? ''" size="lg" />{{ team(adjTeam)?.name }}</span>
      <select v-model="adjTeam" required class="team-select" :class="{ picked: !!adjTeam }" :style="teamStyle(adjTeam)">
        <option :value="null" disabled>팀 선택</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
      <label v-for="r in RESOURCES" :key="r.key" class="row" style="gap: 4px">
        <Icon :name="r.key" /> <input v-model.number="adj[r.key]" type="number" style="width: 5em" :title="`${r.label} 증감 (음수 = 차감)`" />
      </label>
      <label class="row" style="gap: 4px"><input v-model="reason" type="radio" value="production" /> 생산</label>
      <label class="row" style="gap: 4px"><input v-model="reason" type="radio" value="correction" /> 정정</label>
      <button type="submit" :disabled="busy || !adjTeam || !adjText" :style="teamStyle(adjTeam)" class="team-apply">{{ adjTeam ? `${team(adjTeam)?.name}에 적용` : '적용' }}</button>
    </form>
    <p class="muted" style="margin: 4px 0 0">증감으로 입력합니다 (음수 = 차감). 팀원에게 "생산: 보석 +3" 처럼 알림이 갑니다. 라이프 지급에 제한은 없습니다.</p>

    <h3>대가 없는 원조 <span class="muted">리더 협의 단계 · 게임 전체 라운드당 1회</span></h3>
    <p class="muted" style="margin: 0 0 6px">리더 4명 중 3명 이상 찬성해야 통과합니다. 통과한 원조만 입력하세요. 한 라운드에 1건만 가능하고 다음 라운드에 다시 할 수 있습니다.</p>
    <ul v-if="view.aidsToday.length" class="aids">
      <li v-for="a in view.aidsToday" :key="a.fromTeamId">
        <TeamMark :color="team(a.fromTeamId)?.color ?? ''" />{{ team(a.fromTeamId)?.name }} →
        <TeamMark :color="team(a.toTeamId)?.color ?? ''" />{{ team(a.toTeamId)?.name }}
        <span class="mono">{{ amountText(a.amounts) }}</span>
      </li>
    </ul>
    <p v-if="!aidPhase" class="muted">리더 협의 단계에서 입력할 수 있습니다.</p>
    <p v-else-if="aidUsed" class="muted"><span class="badge off">이번 라운드 원조 완료</span> 다음 라운드 리더 협의에서 다시 할 수 있습니다.</p>
    <form v-else class="row" @submit.prevent="aidConfirm = true">
      <select v-model="aidFrom" required class="team-select" :class="{ picked: !!aidFrom }" :style="teamStyle(aidFrom)">
        <option :value="null" disabled>주는 팀</option>
        <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
      →
      <select v-model="aidTo" required class="team-select" :class="{ picked: !!aidTo }" :style="teamStyle(aidTo)">
        <option :value="null" disabled>받는 팀</option>
        <option v-for="g in groups" :key="g.id" :value="g.id" :disabled="g.id === aidFrom">{{ g.name }}</option>
      </select>
      <label v-for="r in RESOURCES" :key="r.key" class="row" style="gap: 4px">
        <Icon :name="r.key" /> <input v-model.number="aid[r.key]" type="number" min="0" style="width: 5em" />
      </label>
      <button type="submit" :disabled="busy || !aidFrom || !aidTo || !aidText">원조 처리</button>
    </form>
    <!-- 제재(대가 없는 제재: 한 팀의 다음날 하루 거래 금지)는 차후 이 자리에 추가 -->

    <p class="muted" style="min-height: 1.2em">{{ status }}</p>

    <details>
      <summary>변동 이력 (최근 {{ view.ledger.length }}건)</summary>
      <table class="tbl ledger">
        <tbody>
          <tr v-for="l in view.ledger" :key="l.id">
            <td class="mono muted">{{ l.day }}라운드</td>
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
      :message="`${team(aidFrom ?? 0)?.name} → ${team(aidTo ?? 0)?.name}: ${aidText}\n이번 라운드에는 더 이상 원조할 수 없습니다 (라운드당 1회).`"
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
.aids { margin: 0 0 8px; padding-left: 18px; font-size: 0.9rem; }
.ledger { margin-top: 6px; font-size: 0.85rem; }
summary { cursor: pointer; color: var(--muted); font-size: 0.9rem; }
/* 팀 선택 강조 (docs/103 §2): 고른 팀 색으로 테두리·글자, 옆에 팀 칩 */
.team-select.picked { border: 2px solid var(--team); color: var(--team); font-weight: 700; background: color-mix(in srgb, var(--team) 12%, var(--surface)); }
.team-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border: 2px solid var(--team); border-radius: var(--radius); font-weight: 700; color: var(--team); background: color-mix(in srgb, var(--team) 12%, var(--surface)); }
.team-apply { border: 2px solid var(--team, var(--ink)); }
</style>
