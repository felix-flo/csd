<script setup lang="ts">
/**
 * 리더 선출 (팀원 전원 무기명 투표).
 * 팀원을 고른 뒤 "투표 확인" → 확인 팝업 → 확정. 확정한 투표는 바꿀 수 없다 (서버도 already_voted 로 거부).
 * 팀원에게는 누가 투표했는지와 결과(득표)만 보인다. 누가 누구를 찍었는지는 본인 것만.
 */
import { computed, ref } from 'vue'
import type { PublicUser } from '../../../shared/types'
import type { ElectionView } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ members: PublicUser[]; election: ElectionView | null }>()
const auth = useAuthStore()
const game = useGameStore()
const busy = ref(false)
const status = ref('')
const picked = ref<number | null>(null)
const confirmOpen = ref(false)

const voted = computed(() => new Set(props.election?.voted ?? []))
const done = computed(() => props.election?.myVote != null)
const nameOf = (id: number | null) => props.members.find((m) => m.id === id)?.name ?? '-'

function pick(id: number) {
  if (done.value) return
  picked.value = id
}

async function vote() {
  const candidateId = picked.value
  if (candidateId == null) return
  busy.value = true
  status.value = ''
  try {
    const res = await api.post<{ election: ElectionView; user: PublicUser }>('/api/game/vote', { candidateId })
    if (game.team) game.team.election = res.election
    if (res.user) auth.user = res.user
  } catch (e) {
    status.value = e instanceof ApiError && e.detail ? e.detail : `실패: ${(e as Error).message}`
    void game.load()
  } finally {
    busy.value = false
    confirmOpen.value = false
  }
}
</script>

<template>
  <div class="card">
    <h2>리더 선출</h2>
    <template v-if="!election">
      <p class="muted">선거 정보가 없습니다.</p>
    </template>
    <template v-else-if="election.status === 'voting'">
      <p v-if="done" class="done-msg">
        <span class="badge on">투표 완료</span> <strong>{{ nameOf(election.myVote) }}</strong> 님에게 투표했습니다. 모든 팀원이 투표하면 결과가 나옵니다.
      </p>
      <p v-else class="muted">리더로 뽑을 팀원을 고른 뒤 "투표 확인" 을 누르세요. 무기명이며, 한 번 확정하면 바꿀 수 없습니다.</p>
      <ul class="candidates">
        <li v-for="m in members" :key="m.id">
          <button
            class="cand"
            :class="{ mine: done ? election.myVote === m.id : picked === m.id }"
            :disabled="busy || done"
            @click="pick(m.id)"
          >
            <span>{{ m.name }}<span v-if="m.id === auth.user?.id" class="muted"> (나)</span></span>
            <span v-if="m.isLeader" class="badge">현 리더</span>
            <span v-if="done && election.myVote === m.id" class="badge on">내 투표</span>
            <span v-else-if="!done && picked === m.id" class="badge warn">선택</span>
          </button>
        </li>
      </ul>
      <div v-if="!done" class="row" style="margin-top: 10px">
        <button :disabled="busy || picked == null" @click="confirmOpen = true">투표 확인</button>
        <span v-if="picked == null" class="muted">팀원을 먼저 고르세요</span>
      </div>
      <p class="muted" style="margin: 10px 0 0">
        투표 {{ election.voted.length }} / {{ election.voters }} ·
        <span v-for="m in members" :key="m.id" class="voter" :class="{ done: voted.has(m.id) }">{{ voted.has(m.id) ? '✓' : '·' }} {{ m.name }}</span>
      </p>
    </template>
    <template v-else-if="election.status === 'tie'">
      <p><span class="badge warn">동표</span> {{ election.tied.map(nameOf).join(', ') }} — 진행자가 리더를 지정합니다.</p>
    </template>
    <template v-else>
      <p>리더: <strong>{{ nameOf(election.leaderId) }}</strong></p>
      <p v-if="election.tally" class="muted">
        <span v-for="(n, id) in election.tally" :key="id" class="voter done">{{ nameOf(Number(id)) }} {{ n }}표</span>
      </p>
    </template>
    <p v-if="status" class="error">{{ status }}</p>

    <ModalDialog
      :open="confirmOpen"
      :title="`${nameOf(picked)} 님에게 투표할까요?`"
      message="확정하면 투표를 바꿀 수 없습니다."
      confirm-label="투표 확정"
      cancel-label="다시 고르기"
      :busy="busy"
      @confirm="vote"
      @cancel="confirmOpen = false"
    />
  </div>
</template>

<style scoped>
.candidates { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.cand {
  width: 100%;
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-start;
  background: var(--surface);
  color: var(--ink);
  border-color: var(--line);
  padding: 12px 14px;
  font-size: 1rem;
  text-align: left;
}
.cand:hover { background: var(--bg-soft); border-color: var(--line-strong); }
.cand:disabled:hover { background: var(--surface); border-color: var(--line); }
.cand.mine { border-color: var(--blue); box-shadow: 0 0 0 2px var(--blue-bg); }
.cand > span:first-child { flex: 1; }
.voter { margin-right: 10px; white-space: nowrap; }
.voter.done { color: var(--ink); }
.done-msg { margin: 0 0 10px; }
</style>
