<script setup lang="ts">
/**
 * 계정 관리: 이름 수정, PIN 열람/리셋, 활성/비활성.
 * - PIN 리셋은 본인과 프레젠테이션 계정 제외. 리셋하면 해당 유저의 세션이 즉시 끊긴다.
 * - 활성/비활성은 member 만. admin/presenter 는 항상 활성.
 */
import { computed, ref } from 'vue'
import type { AdminUser, GroupInfo } from '../../../shared/types'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'

const props = defineProps<{ users: AdminUser[]; groups: GroupInfo[] }>()
const emit = defineEmits<{ updated: [users: AdminUser[]] }>()
const auth = useAuthStore()

const busy = ref(false)
const status = ref('')
const editingId = ref<number | null>(null)
const editName = ref('')
const showPins = ref(false)

const members = computed(() => props.users.filter((u) => u.role === 'member'))
const staff = computed(() => props.users.filter((u) => u.role !== 'member'))
const groups = computed(() => {
  const m = new Map<string, AdminUser[]>(props.groups.map((g) => [g.name, []]))
  for (const u of members.value) {
    const key = u.groupName ?? '(그룹 없음)'
    m.set(key, [...(m.get(key) ?? []), u])
  }
  return [...m.entries()]
})

async function run(label: string, fn: () => Promise<{ users: AdminUser[] } & Record<string, unknown>>) {
  busy.value = true
  status.value = ''
  try {
    const res = await fn()
    emit('updated', res.users)
    status.value = label
    return res
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}

function setActive(ids: number[], active: boolean) {
  if (ids.length === 0) return
  return run(`${active ? '활성화' : '비활성화'}됨`, () =>
    api.post('/api/admin/users/active', { ids, active }),
  )
}

function startEdit(u: AdminUser) {
  editingId.value = u.id
  editName.value = u.name
}

async function saveName(u: AdminUser) {
  const name = editName.value.trim()
  if (!name) return
  await run(`${name} 으로 변경됨`, () => api.post(`/api/admin/users/${u.id}/name`, { name }))
  editingId.value = null
}

async function resetPin(u: AdminUser) {
  if (!confirm(`${u.name} 의 PIN 을 새로 발급할까요? 접속 중이면 즉시 끊깁니다.`)) return
  const res = await run('', () => api.post(`/api/admin/users/${u.id}/reset-pin`))
  if (res) status.value = `${u.name} 새 PIN: ${res.pin as string}`
}

function canResetPin(u: AdminUser) {
  return u.id !== auth.user?.id && u.role !== 'presenter'
}

function copyList() {
  const lines = props.users.map((u) => `${u.groupName ?? u.role}\t${u.name}\t${u.pin ?? ''}`)
  navigator.clipboard?.writeText(lines.join('\n')).then(
    () => { status.value = '이름/PIN 목록을 클립보드에 복사했습니다' },
    () => { status.value = '복사 실패' },
  )
}
</script>

<template>
  <div class="card">
    <h2>계정 관리</h2>
    <p class="muted">
      이름을 클릭하면 수정할 수 있습니다. PIN 은 참가자에게 배부할 때만 표시하세요.
    </p>

    <div class="row" style="margin-bottom: 12px">
      <button class="secondary" @click="showPins = !showPins">{{ showPins ? 'PIN 숨기기' : 'PIN 보기' }}</button>
      <button class="secondary" @click="copyList">이름/PIN 목록 복사</button>
      <button :disabled="busy" class="secondary" @click="setActive(members.map((u) => u.id), true)">그룹원 전체 활성화</button>
      <button :disabled="busy" class="secondary" @click="setActive(members.map((u) => u.id), false)">그룹원 전체 비활성화</button>
    </div>
    <p class="muted" style="min-height: 1.2em">{{ status }}</p>

    <table class="users">
      <thead>
        <tr><th>#</th><th>이름</th><th>역할</th><th>PIN</th><th>상태</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="u in staff" :key="u.id">
          <td class="muted">{{ u.id }}</td>
          <td>
            <template v-if="editingId === u.id">
              <input v-model="editName" maxlength="20" style="width: 9em" @keyup.enter="saveName(u)" @keyup.esc="editingId = null" />
              <button class="small" :disabled="busy" @click="saveName(u)">저장</button>
            </template>
            <a v-else href="#" @click.prevent="startEdit(u)">{{ u.name }}</a>
          </td>
          <td>{{ u.role }}</td>
          <td class="pin">{{ showPins ? u.pin : '••••' }}</td>
          <td><span class="badge on">활성</span></td>
          <td><button v-if="canResetPin(u)" :disabled="busy" class="secondary small" @click="resetPin(u)">PIN 리셋</button></td>
        </tr>
      </tbody>
      <tbody v-for="[groupName, list] in groups" :key="groupName">
        <tr class="group-head">
          <td colspan="4"><strong>{{ groupName }}</strong> <span class="muted">{{ list.length }}명</span></td>
          <td colspan="2" class="row" style="justify-content: flex-end">
            <button :disabled="busy" class="secondary small" @click="setActive(list.map((u) => u.id), true)">전체 활성</button>
            <button :disabled="busy" class="secondary small" @click="setActive(list.map((u) => u.id), false)">전체 비활성</button>
          </td>
        </tr>
        <tr v-for="u in list" :key="u.id" :class="{ inactive: !u.active }">
          <td class="muted">{{ u.id }}</td>
          <td>
            <template v-if="editingId === u.id">
              <input v-model="editName" maxlength="20" style="width: 9em" @keyup.enter="saveName(u)" @keyup.esc="editingId = null" />
              <button class="small" :disabled="busy" @click="saveName(u)">저장</button>
            </template>
            <template v-else>
              <a href="#" @click.prevent="startEdit(u)">{{ u.name }}</a>
              <span v-if="u.isLeader" class="badge">리더</span>
              <span v-if="!u.nameSet" class="badge warn">이름 미입력</span>
            </template>
          </td>
          <td>{{ u.role }}</td>
          <td class="pin">{{ showPins ? u.pin : '••••' }}</td>
          <td><span class="badge" :class="u.active ? 'on' : 'off'">{{ u.active ? '활성' : '비활성' }}</span></td>
          <td class="row">
            <button :disabled="busy" class="secondary small" @click="resetPin(u)">PIN 리셋</button>
            <button :disabled="busy" class="secondary small" @click="setActive([u.id], !u.active)">
              {{ u.active ? '비활성화' : '활성화' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.users { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
.users th, .users td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.users th { color: var(--muted); font-weight: 500; font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.08em; }
.users tr.group-head td { background: var(--paper); padding-top: 10px; }
.users tr.inactive td { opacity: 0.55; }
.users a { color: inherit; text-decoration: underline dotted; }
.pin { font-family: var(--font-mono); letter-spacing: 0.15em; }
button.small { padding: 4px 10px; font-size: 0.85rem; }
</style>
