<script setup lang="ts">
/**
 * 계정 활성/비활성 관리.
 * - member 만 토글 가능. admin/presenter 는 PIN 을 그대로 쓰므로 서버에서도 제외된다.
 * - 비활성화하면 로그인 불가 + 기존 세션(refresh 토큰, 소켓) 즉시 종료.
 */
import { computed, onMounted, ref } from 'vue'
import type { AdminUser } from '../../../shared/types'
import { api } from '../lib/api'

const users = ref<AdminUser[]>([])
const busy = ref(false)
const status = ref('')

const members = computed(() => users.value.filter((u) => u.role === 'member'))
const staff = computed(() => users.value.filter((u) => u.role !== 'member'))
const groups = computed(() => {
  const m = new Map<string, AdminUser[]>()
  for (const u of members.value) {
    const key = u.groupName ?? '(그룹 없음)'
    m.set(key, [...(m.get(key) ?? []), u])
  }
  return [...m.entries()]
})

async function load() {
  const res = await api.get<{ users: AdminUser[] }>('/api/admin/users')
  users.value = res.users
}

async function setActive(ids: number[], active: boolean) {
  if (ids.length === 0) return
  busy.value = true
  status.value = ''
  try {
    const res = await api.post<{ changed: number; users: AdminUser[] }>('/api/admin/users/active', { ids, active })
    users.value = res.users
    status.value = `${res.changed}명 ${active ? '활성화' : '비활성화'}됨`
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="card">
    <h2>계정 관리</h2>
    <p class="muted">
      그룹원 계정만 활성/비활성 전환됩니다. 비활성 계정은 로그인할 수 없고, 이미 접속 중이면 즉시 끊깁니다.
      진행자/프레젠테이션 계정은 항상 활성입니다.
    </p>

    <div class="row" style="margin-bottom: 12px">
      <button :disabled="busy" @click="setActive(members.map((u) => u.id), true)">그룹원 전체 활성화</button>
      <button :disabled="busy" class="secondary" @click="setActive(members.map((u) => u.id), false)">그룹원 전체 비활성화</button>
      <span class="muted">{{ status }}</span>
    </div>

    <table class="users">
      <thead>
        <tr><th>#</th><th>이름</th><th>역할</th><th>상태</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="u in staff" :key="u.id">
          <td class="muted">{{ u.id }}</td>
          <td>{{ u.name }}</td>
          <td>{{ u.role }}</td>
          <td><span class="badge on">활성</span></td>
          <td class="muted">고정</td>
        </tr>
      </tbody>
      <tbody v-for="[groupName, list] in groups" :key="groupName">
        <tr class="group-head">
          <td colspan="3"><strong>{{ groupName }}</strong></td>
          <td colspan="2" class="row" style="justify-content: flex-end">
            <button :disabled="busy" class="secondary small" @click="setActive(list.map((u) => u.id), true)">전체 활성</button>
            <button :disabled="busy" class="secondary small" @click="setActive(list.map((u) => u.id), false)">전체 비활성</button>
          </td>
        </tr>
        <tr v-for="u in list" :key="u.id" :class="{ inactive: !u.active }">
          <td class="muted">{{ u.id }}</td>
          <td>{{ u.name }} <span v-if="u.isLeader" class="badge">리더</span></td>
          <td>{{ u.role }}</td>
          <td><span class="badge" :class="u.active ? 'on' : 'off'">{{ u.active ? '활성' : '비활성' }}</span></td>
          <td>
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
.users th, .users td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.users th { color: var(--muted); font-weight: 500; }
.users tr.group-head td { background: var(--bg); padding-top: 10px; }
.users tr.inactive td { opacity: 0.55; }
button.small { padding: 4px 10px; font-size: 0.85rem; }
</style>
