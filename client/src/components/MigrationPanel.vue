<script setup lang="ts">
/**
 * 이주 (참가자, docs/100 N3). 이주 시작 라운드부터 보인다.
 * - 일반 팀원: 받을 팀을 골라 신청 (확인 팝업: 빈손 이동) → 대기 중이면 취소. 1인 대기 1건
 * - 리더: 우리 팀으로 온 신청을 수락/거절 (리더 본인은 신청 불가)
 * - 이주는 1인 1회: 이미 이주한 사람(migration.done)은 신청 화면 대신 완료 안내만 본다
 * - 라이프 제출 단계에는 신청·수락이 없다. 신청은 받는 팀 리더에게만 가고, 수락되면 전체에 공지된다
 */
import { computed, ref } from 'vue'
import type { TeamMigrationView, MigrationView } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
import { shortTeamName } from '../lib/teamTheme'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import TeamMark from './TeamMark.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ migration: TeamMigrationView; myTeamId: number; isLeader: boolean; day: number }>()
const game = useGameStore()
const teams = useTeamsStore()
const others = computed(() => teams.teams.filter((t) => t.id !== props.myTeamId))
const nameOf = (id: number) => teams.byId(id)?.name ?? `#${id}`
const picked = ref<number | null>(null)
const busy = ref(false)
const error = ref('')

type Modal = { kind: 'request' } | { kind: 'cancel' } | { kind: 'decide'; m: MigrationView; accept: boolean }
const modal = ref<Modal | null>(null)
const modalText = computed(() => {
  const m = modal.value
  if (!m) return { title: '', message: '', confirm: '' }
  if (m.kind === 'request') {
    return {
      title: `${nameOf(picked.value!)}으로 이주를 신청할까요?`,
      message: '받는 팀 리더가 수락하면 바로 소속이 바뀌고 전체에 공지됩니다. 재화는 가져가지 않고(빈손), 이후 라이프는 새 팀이 냅니다.',
      confirm: '신청',
    }
  }
  if (m.kind === 'cancel') return { title: '이주 신청을 취소할까요?', message: '', confirm: '신청 취소' }
  return m.accept
    ? { title: `${m.m.userName} 님의 이주를 수락할까요?`, message: `${nameOf(m.m.fromTeamId)} → 우리 팀. 수락하면 바로 우리 팀원이 되고 전체에 공지됩니다.`, confirm: '수락' }
    : { title: `${m.m.userName} 님의 이주를 거절할까요?`, message: '신청한 사람에게만 알립니다.', confirm: '거절' }
})

async function run(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await fn()
    picked.value = null
  } catch (e) {
    error.value = e instanceof ApiError && e.detail ? e.detail : `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
    modal.value = null
    void game.load()
  }
}

function onConfirm() {
  const m = modal.value
  if (!m) return
  if (m.kind === 'request') return run(() => api.post('/api/migration/request', { toTeamId: picked.value }))
  if (m.kind === 'cancel') return run(() => api.post(`/api/migration/${props.migration.mine!.id}/cancel`))
  return run(() => api.post(`/api/migration/${m.m.id}/decide`, { accept: m.accept }))
}
</script>

<template>
  <div v-if="day >= migration.startDay" class="card">
    <h2>이주</h2>
    <!-- 리더: 받은 신청 -->
    <template v-if="isLeader">
      <p class="hint">리더는 이주를 신청할 수 없습니다. 우리 팀으로 온 신청을 수락하거나 거절하세요.</p>
      <p v-if="!migration.incoming.length" class="hint">받은 이주 신청 없음</p>
      <div v-else class="lines">
        <div v-for="m in migration.incoming" :key="m.id" class="line incoming">
          <b>{{ m.userName }}<small><TeamMark :color="teams.byId(m.fromTeamId)?.color ?? ''" />{{ nameOf(m.fromTeamId) }}</small></b>
          <button class="decide secondary" type="button" :disabled="busy || !migration.open" @click="modal = { kind: 'decide', m, accept: false }">거절</button>
          <button class="decide" type="button" :disabled="busy || !migration.open" @click="modal = { kind: 'decide', m, accept: true }">수락</button>
        </div>
      </div>
      <p v-if="migration.incoming.length && !migration.open" class="hint">라이프 제출 단계에는 처리할 수 없습니다.</p>
    </template>
    <!-- 일반 팀원: 신청 -->
    <template v-else-if="migration.mine">
      <p class="hint"><TeamMark :color="teams.byId(migration.mine.toTeamId)?.color ?? ''" /><strong>{{ nameOf(migration.mine.toTeamId) }}</strong>에 이주 신청 중입니다. 그 팀 리더의 수락을 기다립니다.</p>
      <button class="secondary wide" type="button" :disabled="busy" @click="modal = { kind: 'cancel' }">신청 취소</button>
    </template>
    <template v-else-if="migration.done">
      <p class="hint">
        {{ migration.done.day }}라운드에 <TeamMark :color="teams.byId(migration.done.fromTeamId)?.color ?? ''" />{{ nameOf(migration.done.fromTeamId) }} →
        <TeamMark :color="teams.byId(migration.done.toTeamId)?.color ?? ''" /><strong>{{ nameOf(migration.done.toTeamId) }}</strong>로 이주했습니다.
      </p>
      <p class="hint">이주는 한 번만 할 수 있습니다.</p>
    </template>
    <template v-else-if="migration.open">
      <p class="hint">다른 팀으로 옮길 수 있습니다. 신청은 받는 팀 리더에게만 전달되고, 수락되면 바로 소속이 바뀝니다. 재화는 가져가지 않습니다.</p>
      <div class="picks">
        <button v-for="t in others" :key="t.id" type="button" class="pick" :class="{ on: picked === t.id }" :disabled="busy" @click="picked = t.id">
          <TeamMark :color="t.color" />{{ shortTeamName(t.name) }}
        </button>
      </div>
      <button class="wide" type="button" :disabled="busy || picked == null" @click="modal = { kind: 'request' }">{{ picked == null ? '옮길 팀을 고르세요' : `${nameOf(picked)}으로 이주 신청` }}</button>
    </template>
    <p v-else class="hint">라이프 제출 단계에는 이주를 신청할 수 없습니다. 다음 라운드에 신청하세요.</p>
    <p v-if="error" class="error">{{ error }}</p>
    <ModalDialog
      :open="modal !== null"
      :title="modalText.title"
      :message="modalText.message"
      :confirm-label="modalText.confirm"
      cancel-label="닫기"
      :danger="modal?.kind === 'decide' && !modal.accept"
      :busy="busy"
      @confirm="onConfirm"
      @cancel="modal = null"
    />
  </div>
</template>

<style scoped>
.incoming b { flex: 1 1 0; min-width: 0; font-weight: 800; }
.incoming small { display: block; font-size: 14px; font-weight: 600; }
.decide { flex: none; width: 66px; height: 44px; padding: 0; font-size: 16px; font-weight: 800; }
</style>
