<script setup lang="ts">
/**
 * 팀 · 진행자 구성.
 * - 팀: 추가(이름 + 팔레트 색), 이름·색 수정, 소속 참가자 0명일 때만 삭제.
 * - 진행자 수: **늘리기만** 가능. 진행자는 게임 리셋 때 지워지므로 게임마다 다시 만든다.
 * - 팀별 최대 인원(참가자 PIN 수)은 "게임 설정" 카드에서 정한다. 참가자는 준비 상태에서 직접 팀을 고른다.
 */
import { computed, ref, watch } from 'vue'
import type { AdminUser, GroupInfo } from '../../../shared/types'
import { TEAM_PALETTE } from '../../../shared/teams'
import { api } from '../lib/api'
import TeamMark from './TeamMark.vue'
import TeamPalette from './TeamPalette.vue'

const props = defineProps<{ users: AdminUser[]; groups: GroupInfo[] }>()
const emit = defineEmits<{ updated: [users: AdminUser[], groups: GroupInfo[]] }>()

const busy = ref(false)
const status = ref('')

/** 팀별 현재 인원 (활성·비활성 포함) */
const countOf = computed(() => {
  const m = new Map<number, number>()
  for (const u of props.users) if (u.role === 'member' && u.groupId != null) m.set(u.groupId, (m.get(u.groupId) ?? 0) + 1)
  return (id: number) => m.get(id) ?? 0
})
const currentStaff = computed(() => props.users.filter((u) => u.role === 'admin').length)

const staff = ref(currentStaff.value)
watch(currentStaff, (n) => { staff.value = n }, { immediate: true })

async function run<T extends { users: AdminUser[]; teams?: GroupInfo[]; groups?: GroupInfo[] }>(label: string, fn: () => Promise<T>) {
  busy.value = true
  status.value = ''
  try {
    const res = await fn()
    emit('updated', res.users, res.teams ?? res.groups ?? props.groups)
    status.value = label
    return res
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}

// ---- 진행자 추가 ----
async function apply() {
  const staffWant = Math.max(staff.value, currentStaff.value)
  if (staffWant === currentStaff.value) {
    status.value = '변경 없음'
    return
  }
  const res = await run('', () => api.post<{ created: number; users: AdminUser[]; groups: GroupInfo[] }>('/api/admin/roster', { staff: staffWant }))
  if (res) status.value = `진행자 ${res.created}명 생성`
}

// ---- 팀 추가 ----
const newName = ref('')
const newColor = ref(TEAM_PALETTE[4]!.hex)
async function addTeam() {
  const name = newName.value.trim()
  if (!name) return
  const res = await run(`${name} 추가됨`, () => api.post<{ users: AdminUser[]; teams: GroupInfo[] }>('/api/admin/teams', { name, color: newColor.value }))
  if (res) newName.value = ''
}

// ---- 팀 수정 / 삭제 ----
const editingId = ref<number | null>(null)
const editName = ref('')
const editColor = ref('')
function startEdit(g: GroupInfo) {
  editingId.value = g.id
  editName.value = g.name
  editColor.value = g.color
}
async function saveEdit(g: GroupInfo) {
  const name = editName.value.trim()
  if (!name) return
  await run(`${name} 저장됨`, () => api.patch<{ users: AdminUser[]; teams: GroupInfo[] }>(`/api/admin/teams/${g.id}`, { name, color: editColor.value }))
  editingId.value = null
}
async function removeTeam(g: GroupInfo) {
  if (!confirm(`${g.name} 을(를) 삭제할까요?`)) return
  await run(`${g.name} 삭제됨`, () => api.delete<{ users: AdminUser[]; teams: GroupInfo[] }>(`/api/admin/teams/${g.id}`))
}
</script>

<template>
  <div class="card">
    <h2>팀 · 진행자 구성</h2>
    <p class="muted">
      팀 이름을 클릭하면 이름과 색을 바꿀 수 있습니다. 팀별 최대 인원은 "게임 설정" 카드에서 정하고, 참가자는 게임 준비 상태에서 직접 팀을 고릅니다.
      진행자는 <strong>늘리기만</strong> 할 수 있고, 게임 리셋 때 삭제되므로 게임마다 다시 만듭니다.
    </p>

    <table class="teams">
      <thead>
        <tr><th>팀</th><th>현재 참가자</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="g in groups" :key="g.id">
          <td>
            <template v-if="editingId === g.id">
              <span class="row">
                <input v-model="editName" maxlength="20" style="width: 9em" @keyup.enter="saveEdit(g)" @keyup.esc="editingId = null" />
                <TeamPalette v-model="editColor" />
                <button class="small" :disabled="busy" @click="saveEdit(g)">저장</button>
                <button class="secondary small" type="button" @click="editingId = null">취소</button>
              </span>
            </template>
            <template v-else>
              <TeamMark :color="g.color" />
              <a href="#" @click.prevent="startEdit(g)">{{ g.name }}</a>
            </template>
          </td>
          <td class="muted">{{ countOf(g.id) }}명</td>
          <td>
            <button class="secondary small" :disabled="busy || countOf(g.id) > 0" :title="countOf(g.id) > 0 ? '소속 참가자가 있는 팀은 삭제할 수 없습니다' : ''" @click="removeTeam(g)">삭제</button>
          </td>
        </tr>
      </tbody>
    </table>

    <form class="row" style="margin-top: 10px" @submit.prevent="addTeam">
      <input v-model="newName" placeholder="새 팀 이름" maxlength="20" style="width: 9em" required />
      <TeamPalette v-model="newColor" />
      <button type="submit" class="secondary" :disabled="busy">팀 추가</button>
    </form>

    <form class="row" style="margin-top: 14px" @submit.prevent="apply">
      <label>진행자 <input v-model.number="staff" type="number" :min="currentStaff" max="20" style="width: 5em" /></label>
      <button type="submit" :disabled="busy">진행자 추가</button>
      <span class="muted">진행자 {{ currentStaff }}명 · {{ status }}</span>
    </form>
  </div>
</template>

<style scoped>
.teams { border-collapse: collapse; font-size: 0.95rem; }
.teams th, .teams td { text-align: left; padding: 6px 10px 6px 0; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.teams th { color: var(--muted); font-weight: 500; font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.08em; }
.teams a { color: inherit; text-decoration: underline dotted; }
button.small { padding: 4px 10px; font-size: 0.85rem; }
</style>
