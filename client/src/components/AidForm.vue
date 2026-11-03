<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 대가 없는 원조 입력 (관리자, 리더 협의 단계의 "지금 할 일"). 라운드마다 전체 1번 (docs/103 §11).
 * 통과 조건(리더 4명 중 3명 찬성)은 오프라인이고, 통과한 원조만 입력한다
 */
import { computed, reactive, ref } from 'vue'
import type { GroupInfo } from '../../../shared/types'
import { RESOURCE_KINDS, RESOURCE_LABELS, emptyResources, type Resources } from '../../../shared/game'
import { RESOURCES } from '../lib/resources'
import { api } from '../lib/api'
import { useGameStore } from '../stores/game'
import TeamMark from './TeamMark.vue'
import TeamPicker from './TeamPicker.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ groups: GroupInfo[] }>()
const game = useGameStore()
const view = computed(() => game.admin)
const team = (id: number) => props.groups.find((g) => g.id === id)

const busy = ref(false)
const status = ref('')
const aidFrom = ref<number | null>(null)
const aidTo = ref<number | null>(null)
const aid = reactive<Resources>(emptyResources())
const confirmOpen = ref(false)
const used = computed(() => (view.value?.aidsToday.length ?? 0) > 0)
const amountText = (r: Resources) => RESOURCE_KINDS.filter((k) => r[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${r[k]}`).join(', ')
const aidText = computed(() => amountText(aid))
const have = (id: number) => view.value?.teams.find((t) => t.teamId === id)?.resources ?? emptyResources()

async function apply() {
  busy.value = true
  status.value = ''
  try {
    game.setAdmin(await api.post('/api/admin/game/aid', { fromTeamId: aidFrom.value, toTeamId: aidTo.value, amounts: { ...aid } }))
    status.value = '원조 처리됨'
    Object.assign(aid, emptyResources())
    aidFrom.value = null
    aidTo.value = null
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
    confirmOpen.value = false
  }
}
</script>

<template>
  <div class="aid">
    <ul v-if="view?.aidsToday.length" class="done">
      <li v-for="a in view.aidsToday" :key="a.fromTeamId">
        <span class="badge on">처리됨</span>
        <TeamMark :color="team(a.fromTeamId)?.color ?? ''" />{{ team(a.fromTeamId)?.name }} →
        <TeamMark :color="team(a.toTeamId)?.color ?? ''" />{{ team(a.toTeamId)?.name }}
        <span class="mono">{{ amountText(a.amounts) }}</span>
      </li>
    </ul>
    <p v-if="used" class="muted">이번 라운드 원조는 끝났습니다 (라운드마다 전체 1번).</p>
    <form v-else @submit.prevent="confirmOpen = true">
      <!-- 한 격자에 줄을 맞춰 놓는다: 팀 이름 줄 · 팀 버튼 줄 · 재화 줄(오른쪽에 원조 처리) -->
      <div class="grid">
        <p class="lbl" style="grid-area: fl">주는 팀</p>
        <TeamPicker v-model="aidFrom" style="grid-area: fp" :teams="groups" :disabled-id="aidTo" />
        <div class="arrow" style="grid-area: ar" aria-hidden="true">→</div>
        <p class="lbl" style="grid-area: tl">받는 팀</p>
        <TeamPicker v-model="aidTo" style="grid-area: tp" :teams="groups" :disabled-id="aidFrom" />
        <p class="lbl gap-top" style="grid-area: gl">주는 재화</p>
        <div class="give-grid" style="grid-area: gi">
          <label v-for="r in RESOURCES" :key="r.key" class="give">
            <span class="k"><Icon :name="r.key" /> {{ r.label }}</span>
            <input v-model.number="aid[r.key]" type="number" min="0" :title="r.label" />
            <span class="have mono">{{ aidFrom ? `보유 ${have(aidFrom)[r.key]}` : '' }}</span>
          </label>
        </div>
        <button type="submit" class="go" style="grid-area: go" :disabled="busy || !aidFrom || !aidTo || !aidText">원조 처리</button>
      </div>
      <p class="muted note">리더 4명 중 3명 이상 찬성해 통과한 원조만 입력하세요. 수수료 없이 넘어갑니다.</p>
    </form>
    <p v-if="status" class="muted">{{ status }}</p>
    <ModalDialog
      :open="confirmOpen"
      title="원조를 처리할까요?"
      :message="`${team(aidFrom ?? 0)?.name} → ${team(aidTo ?? 0)?.name}: ${aidText}\n이번 라운드에는 더 이상 원조할 수 없습니다 (라운드당 1회).`"
      confirm-label="처리"
      cancel-label="닫기"
      :busy="busy"
      @confirm="apply"
      @cancel="confirmOpen = false"
    />
  </div>
</template>

<style scoped>
.aid p { margin: 0; }
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-areas:
    'fl . tl'
    'fp ar tp'
    'gl . .'
    'gi . go';
  gap: 6px 12px;
  align-items: center;
}
.grid > .team-picker { flex: none; }
.lbl { font-size: 0.85rem; font-weight: 700; color: var(--ink-2); }
.aid .gap-top { margin-top: 8px; }
.arrow { font-size: 1.4rem; color: var(--muted); }
.give-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.give { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.give .k { font-size: 0.82rem; color: var(--ink-2); white-space: nowrap; }
.give input { width: 100%; min-width: 0; }
.give .have { min-height: 1.1em; font-size: 0.78rem; color: var(--muted); }
/* 원조 처리: 재화 입력칸과 같은 높이 줄에, 받는 팀 칸 폭에 맞춰 */
.go { justify-self: stretch; min-height: 44px; }
.note { margin-top: 10px !important; font-size: 0.85rem; }
.done { margin: 0 0 6px; padding: 0; list-style: none; font-size: 0.9rem; }
.done li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
@media (max-width: 1100px) {
  .grid { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'fl' 'fp' 'gl' 'gi' 'tl' 'tp' 'go'; }
  .arrow { display: none; }
}
</style>
