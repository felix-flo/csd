<script setup lang="ts">
/**
 * 리더 선출 (팀원 전원 무기명 투표). 결과가 나오기 전까지 투표를 바꿀 수 있다.
 * 팀원에게는 누가 투표했는지와 결과(득표)만 보인다. 누가 누구를 찍었는지는 본인 것만.
 */
import { computed, ref } from 'vue'
import type { PublicUser } from '../../../shared/types'
import type { ElectionView } from '../../../shared/game'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'

const props = defineProps<{ members: PublicUser[]; election: ElectionView | null }>()
const auth = useAuthStore()
const game = useGameStore()
const busy = ref(false)
const status = ref('')

const voted = computed(() => new Set(props.election?.voted ?? []))
const nameOf = (id: number | null) => props.members.find((m) => m.id === id)?.name ?? '-'

async function vote(candidateId: number) {
  busy.value = true
  status.value = ''
  try {
    const res = await api.post<{ election: ElectionView; user: PublicUser }>('/api/game/vote', { candidateId })
    if (game.team) game.team.election = res.election
    if (res.user) auth.user = res.user
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
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
      <p class="muted">리더로 뽑을 팀원을 누르세요. 무기명이며 모든 팀원이 투표하면 바로 결과가 나옵니다. 그 전까지는 바꿀 수 있습니다.</p>
      <ul class="candidates">
        <li v-for="m in members" :key="m.id">
          <button
            class="cand"
            :class="{ mine: election.myVote === m.id }"
            :disabled="busy"
            @click="vote(m.id)"
          >
            <span>{{ m.name }}<span v-if="m.id === auth.user?.id" class="muted"> (나)</span></span>
            <span v-if="m.isLeader" class="badge">현 리더</span>
            <span v-if="election.myVote === m.id" class="badge on">내 투표</span>
          </button>
        </li>
      </ul>
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
</style>
