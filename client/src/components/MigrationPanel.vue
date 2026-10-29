<script setup lang="ts">
/**
 * 이주 (참가자, docs/100 N3). 이주 시작 라운드부터 보인다.
 * - 일반 팀원: 받을 팀을 골라 신청 (확인 팝업: 빈손 이동) → 대기 중이면 취소. 1인 대기 1건
 * - 리더: 우리 팀으로 온 신청을 수락/거절 (리더 본인은 신청 불가)
 * - 라이프 제출 단계에는 신청·수락이 없다. 신청은 받는 팀 리더에게만 가고, 수락되면 전체에 공지된다
 */
import { computed, ref } from 'vue'
import type { TeamMigrationView, MigrationView } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
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
    <h2>🧳 이주</h2>
    <!-- 리더: 받은 신청 -->
    <template v-if="isLeader">
      <p class="muted">리더는 이주를 신청할 수 없습니다. 우리 팀으로 온 신청을 수락하거나 거절하세요.</p>
      <p v-if="!migration.incoming.length" class="muted">받은 이주 신청 없음</p>
      <ul v-else class="list">
        <li v-for="m in migration.incoming" :key="m.id">
          <span><strong>{{ m.userName }}</strong> <span class="muted">(<TeamMark :color="teams.byId(m.fromTeamId)?.color ?? ''" />{{ nameOf(m.fromTeamId) }})</span></span>
          <span class="row" style="gap: 6px">
            <button class="small" :disabled="busy || !migration.open" @click="modal = { kind: 'decide', m, accept: true }">수락</button>
            <button class="small secondary" :disabled="busy || !migration.open" @click="modal = { kind: 'decide', m, accept: false }">거절</button>
          </span>
        </li>
      </ul>
      <p v-if="migration.incoming.length && !migration.open" class="muted">라이프 제출 단계에는 처리할 수 없습니다.</p>
    </template>
    <!-- 일반 팀원: 신청 -->
    <template v-else-if="migration.mine">
      <p>
        <span class="badge warn">대기 중</span>
        <TeamMark :color="teams.byId(migration.mine.toTeamId)?.color ?? ''" /><strong>{{ nameOf(migration.mine.toTeamId) }}</strong> 에 이주 신청 중 — 그 팀 리더의 수락을 기다립니다
      </p>
      <button class="secondary small" :disabled="busy" @click="modal = { kind: 'cancel' }">신청 취소</button>
    </template>
    <template v-else-if="migration.open">
      <p class="muted">다른 팀으로 옮길 수 있습니다. 신청은 받는 팀 리더에게만 전달되고, 수락되면 바로 소속이 바뀝니다 (빈손 이동).</p>
      <div class="teams">
        <button v-for="t in others" :key="t.id" class="team" :class="{ on: picked === t.id }" :disabled="busy" @click="picked = t.id">
          <TeamMark :color="t.color" />{{ t.name }}
        </button>
      </div>
      <div class="row" style="margin-top: 10px">
        <button :disabled="busy || picked == null" @click="modal = { kind: 'request' }">이주 신청</button>
        <span v-if="picked == null" class="muted">옮길 팀을 고르세요</span>
      </div>
    </template>
    <p v-else class="muted">라이프 제출 단계에는 이주를 신청할 수 없습니다. 다음 라운드에 신청하세요.</p>
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
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); flex-wrap: wrap; }
.teams { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.team { background: var(--surface); color: var(--ink); border: 2px solid var(--line); padding: 12px; }
.team.on { border-color: var(--blue); background: var(--blue); color: #fff; }
button.small { padding: 4px 10px; font-size: 0.85rem; }
</style>
