<script setup lang="ts">
/** 인원 구성: 참가자 수 / 진행자 수를 정하면 서버가 계정을 생성·삭제한다 */
import { computed, ref, watch } from 'vue'
import type { AdminUser, GroupInfo } from '../../../shared/types'
import { api } from '../lib/api'

const props = defineProps<{ users: AdminUser[]; groups: GroupInfo[] }>()
const emit = defineEmits<{ updated: [users: AdminUser[], groups: GroupInfo[]] }>()

const currentParticipants = computed(() => props.users.filter((u) => u.role === 'member').length)
const currentStaff = computed(() => props.users.filter((u) => u.role === 'admin').length)
const currentGroups = computed(() => props.groups.length)
const groupCount = ref(currentGroups.value)
const participants = ref(currentParticipants.value)
const staff = ref(currentStaff.value)
const busy = ref(false)
const status = ref('')

watch([currentGroups, currentParticipants, currentStaff], ([g, p, s]) => {
  groupCount.value = g
  participants.value = p
  staff.value = s
})

async function apply() {
  const removing = participants.value < currentParticipants.value || staff.value < currentStaff.value
  if (removing && !confirm('인원을 줄이면 나중에 만든 계정부터 삭제됩니다. 계속할까요?')) return
  if (groupCount.value !== currentGroups.value && !confirm('그룹 수를 바꾸면 참가자가 모든 그룹에 고르게 재배정됩니다. 계속할까요?')) return
  busy.value = true
  status.value = ''
  try {
    const res = await api.post<{
      created: number; deleted: number; groupsCreated: number; groupsDeleted: number
      users: AdminUser[]; groups: GroupInfo[]
    }>('/api/admin/roster', { groups: groupCount.value, participants: participants.value, staff: staff.value })
    emit('updated', res.users, res.groups)
    status.value = `그룹 +${res.groupsCreated}/-${res.groupsDeleted}, 계정 생성 ${res.created}명, 삭제 ${res.deleted}명`
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="card">
    <h2>인원 구성</h2>
    <p class="muted">
      그룹은 A, B, C… 순으로 만들어지고, 참가자는 랜덤 PIN 으로 생성되어 그룹에 고르게 배정됩니다. 첫 로그인 때 본인이 이름을 입력합니다.
      진행자(admin)는 최소 1명이며 첫 진행자 계정과 본인은 삭제되지 않습니다.
    </p>
    <form @submit.prevent="apply" class="row">
      <label>그룹 <input v-model.number="groupCount" type="number" min="1" max="26" style="width: 5em" /></label>
      <label>참가자 <input v-model.number="participants" type="number" min="0" max="200" style="width: 5em" /></label>
      <label>진행자 <input v-model.number="staff" type="number" min="1" max="20" style="width: 5em" /></label>
      <button type="submit" :disabled="busy">적용</button>
      <span class="muted">현재 그룹 {{ currentGroups }}개 / 참가자 {{ currentParticipants }}명 / 진행자 {{ currentStaff }}명 · {{ status }}</span>
    </form>
  </div>
</template>
