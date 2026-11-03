<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 팀 재화 (관리자, 게임 시작 후): 현재 보유량 표. 가끔 쓰는 정정·변동 이력·초기 재화 합계는 접어 둔다.
 * 생산게임 결과(ProductionForm)와 원조(AidForm)는 그 단계의 "지금 할 일"에서 입력한다.
 * - 정정의 팀 선택은 고른 팀의 색으로 칠해 다른 팀에 잘못 넣는 실수를 막는다 (docs/103 §2). 0 미만이 되는 입력은 서버가 거부한다.
 */
import { computed, reactive, ref } from 'vue'
import type { GroupInfo } from '../../../shared/types'
import { LEDGER_REASON_LABELS, RESOURCE_KINDS, RESOURCE_LABELS, emptyResources, isBeforeStart, type AdminGameView, type Resources } from '../../../shared/game'
import { RESOURCES } from '../lib/resources'
import { api } from '../lib/api'
import { useGameStore } from '../stores/game'
import { teamInk } from '../lib/teamColor'
import TeamMark from './TeamMark.vue'
import ResourceRow from './ResourceRow.vue'
import TeamPicker from './TeamPicker.vue'

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

/** 팀 선택 버튼 색: 고른 팀의 색으로 테두리를 칠한다 */
const teamStyle = (id: number | null) => {
  const c = teamInk(team(id ?? 0)?.color)
  return c ? { '--team': c } : {}
}

// ---- 정정 ----
const adjTeam = ref<number | null>(null)
const adj = reactive<Resources>(emptyResources())
const adjText = computed(() =>
  RESOURCE_KINDS.filter((k) => adj[k]).map((k) => `${RESOURCE_LABELS[k]} ${adj[k] > 0 ? '+' : ''}${adj[k]}`).join(', '),
)
async function applyAdjust() {
  if (!adjTeam.value || !adjText.value) return
  const name = team(adjTeam.value)?.name
  const ok = await run(`${name} 정정: ${adjText.value}`, () =>
    api.post('/api/admin/game/resources', { teamId: adjTeam.value, deltas: { ...adj }, reason: 'correction' }),
  )
  if (ok) Object.assign(adj, emptyResources())
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
          <th>인원</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in view.teams" :key="t.teamId">
          <td class="name"><TeamMark :color="team(t.teamId)?.color ?? ''" />{{ team(t.teamId)?.name.replace(/ 팀$/, '') }}</td>
          <td v-for="k in RESOURCE_KINDS" :key="k" class="mono"><strong>{{ t.resources[k] }}</strong></td>
          <td class="mono">{{ t.activeMembers }}명</td>
        </tr>
      </tbody>
    </table>

    <details class="more">
      <summary>정정 · 변동 이력 · 초기 재화 합계</summary>

      <h3>정정 <span class="muted">잘못 들어간 수량을 증감으로 고칩니다 (음수 = 차감)</span></h3>
      <form class="adjust" @submit.prevent="applyAdjust">
        <TeamPicker v-model="adjTeam" :teams="groups" />
        <div class="row amounts">
          <label v-for="r in RESOURCES" :key="r.key" class="num">
            <Icon :name="r.key" /> <input v-model.number="adj[r.key]" type="number" :title="`${r.label} 증감 (음수 = 차감)`" />
          </label>
          <button type="submit" :disabled="busy || !adjTeam || !adjText" :style="teamStyle(adjTeam)" class="team-apply">{{ adjTeam ? `${team(adjTeam)?.name}에 적용` : '적용' }}</button>
        </div>
      </form>
      <p v-if="status" class="muted" style="margin: 4px 0 0">{{ status }}</p>

      <h3>변동 이력 <span class="muted">최근 {{ view.ledger.length }}건</span></h3>
      <table class="tbl ledger">
        <tbody>
          <tr v-for="l in view.ledger" :key="l.id">
            <td class="mono muted">{{ l.day }}R</td>
            <td><TeamMark :color="team(l.teamId)?.color ?? ''" />{{ team(l.teamId)?.name.replace(/ 팀$/, '') }}</td>
            <td>{{ LEDGER_REASON_LABELS[l.reason] }}</td>
            <td class="mono">{{ RESOURCE_LABELS[l.kind] }} {{ l.delta > 0 ? '+' : '' }}{{ l.delta }} → {{ l.amountAfter }}</td>
            <td class="mono muted">{{ l.createdAt.slice(11, 16) }}</td>
          </tr>
        </tbody>
      </table>

      <h3>초기 재화 합계 <span class="muted">프레젠테이션 공개</span></h3>
      <ResourceRow :amounts="view.state.initialTotals" />
    </details>
  </div>
</template>

<style scoped>
h3 { font-size: 0.95rem; margin: 14px 0 6px; font-weight: 600; }
h3 .muted { font-weight: 400; font-size: 0.8rem; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
.tbl th, .tbl td { text-align: left; padding: 5px 8px 5px 0; border-bottom: 1px solid var(--line-soft); vertical-align: middle; white-space: nowrap; }
.tbl th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
.tbl .name { font-weight: 600; }
.ledger { font-size: 0.85rem; }
.more { margin-top: 10px; }
.more summary { cursor: pointer; color: var(--muted); font-size: 0.9rem; }
.adjust { display: flex; flex-direction: column; gap: 8px; }
.adjust > .team-picker { flex: none; }
.amounts { gap: 6px 12px; align-items: center; }
.num { display: inline-flex; align-items: center; gap: 4px; }
.num input { width: 4.5em; }
.team-apply { border: 2px solid var(--team, var(--ink)); }
</style>
