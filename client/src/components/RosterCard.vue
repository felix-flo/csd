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
import { askConfirm } from '../lib/confirm'
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
/** 팀별 활성 인원 (테스트 계정이 꺼져 있거나 탈락한 사람은 빼고 센다) */
const activeOf = computed(() => {
  const m = new Map<number, number>()
  for (const u of props.users) if (u.role === 'member' && u.groupId != null && u.active) m.set(u.groupId, (m.get(u.groupId) ?? 0) + 1)
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
  if (!(await askConfirm(`${g.name} 을(를) 삭제할까요?`))) return
  await run(`${g.name} 삭제됨`, () => api.delete<{ users: AdminUser[]; teams: GroupInfo[] }>(`/api/admin/teams/${g.id}`))
}
</script>

<template>
  <div class="card">
    <h2>팀 · 진행자 구성</h2>
    <p class="muted">
      팀 이름을 누르면 이름과 색을 바꿀 수 있습니다. 팀별 최대 인원은 "게임 설정"에서 정하고, 참가자는 게임 준비 상태에서 직접 팀을 고릅니다.
    </p>

    <h3>팀 <span class="muted">{{ groups.length }}개</span></h3>
    <ul class="teams">
      <li v-for="g in groups" :key="g.id" :class="{ editing: editingId === g.id }">
        <template v-if="editingId === g.id">
          <input v-model="editName" maxlength="20" class="name-input" @keyup.enter="saveEdit(g)" @keyup.esc="editingId = null" />
          <TeamPalette v-model="editColor" />
          <span class="acts">
            <button class="small" :disabled="busy" @click="saveEdit(g)">저장</button>
            <button class="secondary small" type="button" @click="editingId = null">취소</button>
          </span>
        </template>
        <template v-else>
          <a href="#" class="name" @click.prevent="startEdit(g)"><TeamMark :color="g.color" />{{ g.name }}</a>
          <span class="muted count">참가자 {{ activeOf(g.id) }}명</span>
          <span class="acts">
            <button class="link" type="button" @click="startEdit(g)">수정</button>
            <button class="link" :disabled="busy || countOf(g.id) > 0" :title="countOf(g.id) > 0 ? '소속 참가자가 있는 팀은 삭제할 수 없습니다' : ''" @click="removeTeam(g)">삭제</button>
          </span>
        </template>
      </li>
    </ul>
    <form class="add" @submit.prevent="addTeam">
      <input v-model="newName" placeholder="새 팀 이름" maxlength="20" class="name-input" required />
      <TeamPalette v-model="newColor" />
      <button type="submit" class="secondary small" :disabled="busy">팀 추가</button>
    </form>

    <h3>진행자 <span class="muted">지금 {{ currentStaff }}명</span></h3>
    <p class="muted">늘리기만 할 수 있고, 게임 리셋 때 삭제되므로 게임마다 다시 만듭니다. 만든 진행자의 PIN 은 "계정 관리"에 있습니다.</p>
    <form class="add" @submit.prevent="apply">
      <label class="num">진행자 <input v-model.number="staff" type="number" :min="currentStaff" max="20" />명으로</label>
      <button type="submit" class="small" :disabled="busy">진행자 추가</button>
    </form>
    <p v-if="status" class="muted">{{ status }}</p>
  </div>
</template>

<style scoped>
h3 { font-size: 0.95rem; margin: 16px 0 6px; font-weight: 700; }
h3 .muted { font-weight: 400; font-size: 0.85rem; }
.teams { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line-soft); }
.teams li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; min-height: 44px; padding: 6px 2px; border-bottom: 1px solid var(--line-soft); }
.teams li.editing { background: var(--bg-soft); padding: 8px; }
.name { display: inline-flex; align-items: center; gap: 2px; color: inherit; font-weight: 600; text-decoration: none; }
.name:hover { text-decoration: underline dotted; }
.count { font-size: 0.9rem; }
.acts { display: inline-flex; gap: 4px; margin-left: auto; }
.add { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.name-input { flex: 1 1 8em; min-width: 7em; max-width: 14em; }
.num { display: inline-flex; align-items: center; gap: 6px; }
.num input { width: 4.5em; }
button.small { padding: 4px 10px; font-size: 0.85rem; }
button.link { min-height: 0; padding: 2px 6px; background: none; color: var(--ink-2); font-size: 0.88rem; text-decoration: underline; text-underline-offset: 2px; }
button.link:hover { color: var(--ink); background: none; }
button.link:disabled { color: var(--muted); text-decoration: none; }
</style>
