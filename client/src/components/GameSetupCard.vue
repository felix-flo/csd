<script setup lang="ts">
/**
 * 게임 설정 (시작 전에만): 총 일수, 팀별 테스트 계정 포함 여부, 라이프 매장량, 팀별 초기 재화 → 게임 시작.
 * 리셋하면 총 일수만 비워지고 나머지 설정은 유지된다.
 */
import { computed, reactive, ref, watch } from 'vue'
import type { GroupInfo } from '../../../shared/types'
import { RESOURCE_KINDS, emptyResources, type AdminGameView, type Resources } from '../../../shared/game'
import { RESOURCES } from '../lib/resources'
import { api } from '../lib/api'
import { useGameStore } from '../stores/game'
import TeamMark from './TeamMark.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ groups: GroupInfo[] }>()
const game = useGameStore()
const settings = computed(() => game.admin?.settings)

const totalDays = ref<number | null>(null)
const includeTest = ref(true)
const lifeReserve = ref(0)
const initial = reactive<Record<number, Resources>>({})
const bulk = reactive<Resources>(emptyResources())
const busy = ref(false)
const status = ref('')
const confirmStart = ref(false)

function resetInputs() {
  const s = settings.value
  if (!s) return
  totalDays.value = s.totalDays
  includeTest.value = s.includeTest
  lifeReserve.value = s.lifeReserve
  for (const g of props.groups) initial[g.id] = { ...(s.initial[g.id] ?? emptyResources()) }
}
watch([settings, () => props.groups], resetInputs, { immediate: true })

function applyBulk() {
  for (const g of props.groups) initial[g.id] = { ...bulk }
}

const dirty = computed(() => {
  const s = settings.value
  if (!s) return false
  return (
    totalDays.value !== s.totalDays ||
    includeTest.value !== s.includeTest ||
    lifeReserve.value !== s.lifeReserve ||
    props.groups.some((g) => RESOURCE_KINDS.some((k) => (initial[g.id]?.[k] ?? 0) !== (s.initial[g.id]?.[k] ?? 0)))
  )
})

async function save(): Promise<boolean> {
  busy.value = true
  status.value = ''
  try {
    const body = {
      totalDays: totalDays.value || null,
      includeTest: includeTest.value,
      lifeReserve: Math.max(0, lifeReserve.value || 0),
      initial: Object.fromEntries(props.groups.map((g) => [String(g.id), initial[g.id]])),
    }
    game.setAdmin(await api.put<AdminGameView>('/api/admin/game/settings', body))
    status.value = '저장됨'
    return true
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
    return false
  } finally {
    busy.value = false
  }
}

async function start() {
  if (dirty.value && !(await save())) return
  busy.value = true
  try {
    game.setAdmin(await api.post<AdminGameView>('/api/admin/game/start'))
    status.value = '게임 시작'
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
    confirmStart.value = false
  }
}
</script>

<template>
  <div v-if="game.admin?.state.status === 'setup'" class="card">
    <h2>게임 설정</h2>
    <p class="muted">
      팀·인원 구성과 함께 시작 전에 정합니다. 게임 중에는 바꿀 수 없고, 재화는 진행 중 "팀 재화" 카드에서 조정합니다.
      리셋하면 총 일수만 다시 입력하면 되고 나머지 설정은 유지됩니다.
    </p>

    <div class="row" style="margin-bottom: 10px">
      <label>총 일수 <input v-model.number="totalDays" type="number" min="1" max="30" placeholder="일" style="width: 5em" /></label>
      <label>라이프 매장량 <input v-model.number="lifeReserve" type="number" min="0" style="width: 6em" /></label>
      <label class="row" style="gap: 6px"><input v-model="includeTest" type="checkbox" /> 팀별 테스트 계정(리더 1·팀원 1) 포함</label>
    </div>
    <p class="muted" style="margin-top: 0">
      라이프 매장량: 생산 활동으로 지급할 수 있는 라이프 총량. 테스트 계정을 빼면 해당 계정은 탈락(로그인 차단) 처리됩니다.
    </p>

    <table class="res-table">
      <thead>
        <tr>
          <th>초기 재화</th>
          <th v-for="r in RESOURCES" :key="r.key">{{ r.emoji }} {{ r.label }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr class="bulk">
          <td class="muted">전 팀 동일</td>
          <td v-for="k in RESOURCE_KINDS" :key="k"><input v-model.number="bulk[k]" type="number" min="0" /></td>
          <td><button class="secondary small" type="button" @click="applyBulk">일괄 적용</button></td>
        </tr>
        <tr v-for="g in groups" :key="g.id">
          <td><TeamMark :color="g.color" />{{ g.name }}</td>
          <td v-for="k in RESOURCE_KINDS" :key="k">
            <input v-if="initial[g.id]" v-model.number="initial[g.id]![k]" type="number" min="0" />
          </td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <div class="row" style="margin-top: 12px">
      <button class="secondary" :disabled="busy || !dirty" @click="save">설정 저장</button>
      <button :disabled="busy || !totalDays" @click="confirmStart = true">게임 시작</button>
      <span class="muted">{{ status }}<template v-if="dirty"> · 저장하지 않은 변경 있음</template></span>
    </div>

    <ModalDialog
      :open="confirmStart"
      title="게임을 시작할까요?"
      :message="`총 ${totalDays}일. 시작하면 1일차 리더 선출이 열리고, 지금 팀 구성·재화가 리셋 기준점이 됩니다.`"
      confirm-label="시작"
      cancel-label="취소"
      :busy="busy"
      @confirm="start"
      @cancel="confirmStart = false"
    />
  </div>
</template>

<style scoped>
.res-table { border-collapse: collapse; font-size: 0.9rem; }
.res-table th, .res-table td { text-align: left; padding: 4px 8px 4px 0; border-bottom: 1px solid var(--line-soft); }
.res-table th { color: var(--muted); font-weight: 500; font-size: 0.8rem; white-space: nowrap; }
.res-table input[type='number'] { width: 5em; padding: 4px 6px; }
.res-table tr.bulk td { background: var(--bg-soft); }
button.small { padding: 4px 10px; font-size: 0.85rem; }
</style>
