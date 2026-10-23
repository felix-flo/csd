<script setup lang="ts">
/**
 * 게임 설정 (시작 전: 설정·준비 상태): 총 일수, 팀별 최대 인원, 테스트 계정 포함 여부, 라이프 매장량, 팀별 초기 재화.
 * - 설정 상태: "초기셋팅완료" → 준비 상태 (최대 인원 합계만큼 팀 없는 PIN 생성, 참가자가 로그인해 팀 선택)
 * - 준비 상태: 계속 수정 가능. 최대 인원을 늘리면 PIN 이 추가되고, 줄이면 쓰지 않은 PIN 이 지워진다. 게임 시작은 "게임 진행" 카드
 * 리셋하면 총 일수만 비워지고 나머지 설정은 유지된다.
 */
import { computed, reactive, ref, watch } from 'vue'
import type { GroupInfo } from '../../../shared/types'
import { RESOURCE_KINDS, emptyResources, isBeforeStart, teamLetter, type AdminGameView, type Resources } from '../../../shared/game'
import { RESOURCES } from '../lib/resources'
import { api } from '../lib/api'
import { useGameStore } from '../stores/game'
import TeamMark from './TeamMark.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ groups: GroupInfo[] }>()
/** 계정이 생기거나 지워졌을 수 있음 → 관리자 화면이 계정 목록을 다시 받는다 */
const emit = defineEmits<{ changed: [] }>()
const game = useGameStore()
const settings = computed(() => game.admin?.settings)

const status = computed(() => game.admin?.state.status)
const totalDays = ref<number | null>(null)
const capacity = reactive<Record<number, number>>({})
const includeTest = ref(true)
const lifeReserve = ref(0)
const initial = reactive<Record<number, Resources>>({})
const bulk = reactive<Resources>(emptyResources())
const bulkCapacity = ref(5)
const busy = ref(false)
const message = ref('')
const confirmPrepare = ref(false)

function resetInputs() {
  const s = settings.value
  if (!s) return
  totalDays.value = s.totalDays
  includeTest.value = s.includeTest
  lifeReserve.value = s.lifeReserve
  for (const g of props.groups) {
    initial[g.id] = { ...(s.initial[g.id] ?? emptyResources()) }
    capacity[g.id] = s.capacity[g.id] ?? 0
  }
}
watch([settings, () => props.groups], resetInputs, { immediate: true })

function applyBulk() {
  for (const g of props.groups) initial[g.id] = { ...bulk }
}
function applyBulkCapacity() {
  for (const g of props.groups) capacity[g.id] = Math.max(0, bulkCapacity.value || 0)
}
const totalCapacity = computed(() => props.groups.reduce((sum, g) => sum + (capacity[g.id] || 0), 0))
const canPrepare = computed(() => !!totalDays.value && props.groups.length > 0 && props.groups.every((g) => (capacity[g.id] ?? 0) >= 1))

const dirty = computed(() => {
  const s = settings.value
  if (!s) return false
  return (
    totalDays.value !== s.totalDays ||
    includeTest.value !== s.includeTest ||
    lifeReserve.value !== s.lifeReserve ||
    props.groups.some((g) => (capacity[g.id] ?? 0) !== (s.capacity[g.id] ?? 0)) ||
    props.groups.some((g) => RESOURCE_KINDS.some((k) => (initial[g.id]?.[k] ?? 0) !== (s.initial[g.id]?.[k] ?? 0)))
  )
})

async function save(): Promise<boolean> {
  busy.value = true
  message.value = ''
  try {
    const body = {
      totalDays: totalDays.value || null,
      capacity: Object.fromEntries(props.groups.map((g) => [String(g.id), Math.max(0, capacity[g.id] || 0)])),
      includeTest: includeTest.value,
      lifeReserve: Math.max(0, lifeReserve.value || 0),
      initial: Object.fromEntries(props.groups.map((g) => [String(g.id), initial[g.id]])),
    }
    game.setAdmin(await api.put<AdminGameView>('/api/admin/game/settings', body))
    message.value = '저장됨'
    emit('changed')
    return true
  } catch (e) {
    message.value = `실패: ${(e as Error).message}`
    return false
  } finally {
    busy.value = false
  }
}

/** 초기셋팅완료: 저장 안 한 변경이 있으면 먼저 저장 */
async function prepare() {
  if (dirty.value && !(await save())) return
  busy.value = true
  try {
    game.setAdmin(await api.post<AdminGameView>('/api/admin/game/prepare'))
    message.value = '준비 상태로 전환 · 참가자 PIN 생성됨'
    emit('changed')
  } catch (e) {
    message.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
    confirmPrepare.value = false
  }
}
</script>

<template>
  <div v-if="isBeforeStart(status)" class="card">
    <h2>게임 설정 <span v-if="status === 'ready'" class="badge on">준비 중</span></h2>
    <p v-if="status === 'setup'" class="muted">
      총 일수와 팀별 최대 인원, 초기 재화를 정한 뒤 <strong>초기셋팅완료</strong>를 누르세요. 최대 인원 합계만큼 팀 없는 PIN 이 만들어지고,
      참가자가 로그인해 이름을 입력하고 팀(A, B, C…)을 직접 고릅니다. 진행자 계정은 "팀 · 진행자 구성" 카드에서 만듭니다.
    </p>
    <p v-else class="muted">
      준비 중에도 설정을 바꿀 수 있습니다. 최대 인원을 늘리면 PIN 이 추가되고, 줄이면 아직 쓰지 않은 PIN 이 지워집니다 (이미 들어온 인원 아래로는 줄일 수 없습니다).
      게임 시작은 위 "게임 진행" 카드에서 합니다.
    </p>

    <div class="row" style="margin-bottom: 10px">
      <label>총 일수 <input v-model.number="totalDays" type="number" min="1" max="30" placeholder="일" style="width: 5em" /></label>
      <label>라이프 매장량 <input v-model.number="lifeReserve" type="number" min="0" style="width: 6em" /></label>
      <label class="row" style="gap: 6px"><input v-model="includeTest" type="checkbox" /> 팀별 테스트 계정(리더 1·팀원 1) 포함</label>
    </div>
    <p class="muted" style="margin-top: 0">
      라이프 매장량: 생산 활동으로 지급할 수 있는 라이프 총량. 테스트 계정은 팀·리더가 미리 정해져 있고 최대 인원에 들어가지 않습니다. 빼면 탈락(로그인 차단) 처리됩니다.
    </p>

    <table class="res-table">
      <thead>
        <tr>
          <th>팀</th>
          <th>최대 인원</th>
          <th v-for="r in RESOURCES" :key="r.key">{{ r.emoji }} {{ r.label }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr class="bulk">
          <td class="muted">전 팀 동일</td>
          <td><input v-model.number="bulkCapacity" type="number" min="0" max="50" /> <button class="secondary small" type="button" @click="applyBulkCapacity">적용</button></td>
          <td v-for="k in RESOURCE_KINDS" :key="k"><input v-model.number="bulk[k]" type="number" min="0" /></td>
          <td><button class="secondary small" type="button" @click="applyBulk">일괄 적용</button></td>
        </tr>
        <tr v-for="(g, i) in groups" :key="g.id">
          <td class="nowrap"><span class="letter mono">{{ teamLetter(i) }}</span> <TeamMark :color="g.color" />{{ g.name }}</td>
          <td><input v-model.number="capacity[g.id]" type="number" min="0" max="50" /></td>
          <td v-for="k in RESOURCE_KINDS" :key="k">
            <input v-if="initial[g.id]" v-model.number="initial[g.id]![k]" type="number" min="0" />
          </td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <p class="muted" style="margin: 6px 0 0">참가자 PIN {{ totalCapacity }}개 · 참가자에게는 팀 이름 대신 A, B, C… 로 보입니다.</p>

    <div class="row" style="margin-top: 12px">
      <button :class="status === 'setup' ? 'secondary' : ''" :disabled="busy || !dirty" @click="save">설정 저장</button>
      <button v-if="status === 'setup'" :disabled="busy || !canPrepare" @click="confirmPrepare = true">초기셋팅완료</button>
      <span class="muted">{{ message }}<template v-if="dirty"> · 저장하지 않은 변경 있음</template></span>
    </div>

    <ModalDialog
      :open="confirmPrepare"
      title="초기셋팅을 완료할까요?"
      :message="`참가자 PIN ${totalCapacity}개를 만들고 게임 준비 상태로 바꿉니다. 참가자는 로그인해 이름을 입력하고 팀을 고를 수 있습니다.\n준비 중에도 설정은 바꿀 수 있습니다.`"
      confirm-label="초기셋팅완료"
      cancel-label="취소"
      :busy="busy"
      @confirm="prepare"
      @cancel="confirmPrepare = false"
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
.nowrap { white-space: nowrap; }
.letter { display: inline-block; min-width: 1.4em; font-weight: 600; }
</style>
