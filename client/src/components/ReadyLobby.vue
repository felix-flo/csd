<script setup lang="ts">
/**
 * 게임 시작 전(설정·준비) 참가자 화면. 게임 화면 대신 "게임 준비중 입니다." 만 보여준다.
 * - 준비 상태이고 아직 팀이 없으면 팀을 고른다. 팀은 실제 이름 대신 A, B, C… 와 현재/최대 인원으로 표시, 꽉 찬 팀은 dim.
 * - 한 번 고르면 바꿀 수 없다 (바꾸려면 진행자가 수동 이동). 정원 경쟁은 서버가 판정하고 진 쪽은 "팀이 가득 찼습니다".
 * - 이름 입력(첫 로그인)은 GroupView 가 먼저 처리한다.
 */
import { computed, ref } from 'vue'
import type { LobbyTeam } from '../../../shared/game'
import type { PublicUser } from '../../../shared/types'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import ModalDialog from './ModalDialog.vue'

const auth = useAuthStore()
const game = useGameStore()
const lobby = computed(() => game.state?.lobby ?? null)
const myTeam = computed(() => lobby.value?.find((t) => t.teamId === auth.user?.groupId) ?? null)
const canPick = computed(() => game.state?.status === 'ready' && auth.user?.groupId == null && !!lobby.value)

const picked = ref<LobbyTeam | null>(null)
const busy = ref(false)
const error = ref('')

const full = (t: LobbyTeam) => t.count >= t.capacity

async function join() {
  const t = picked.value
  if (!t) return
  busy.value = true
  error.value = ''
  try {
    const res = await api.post<{ user: PublicUser }>('/api/game/join', { teamId: t.teamId })
    auth.user = res.user
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ''
    error.value = code === 'team_full' ? `${t.label} 팀이 가득 찼습니다. 다른 팀을 고르세요.` : e instanceof ApiError && e.detail ? e.detail : '팀 선택에 실패했습니다.'
    if (code === 'already_joined') void auth.refreshMe()
  } finally {
    busy.value = false
    picked.value = null
    void game.load()
  }
}
</script>

<template>
  <div class="card lobby">
    <h2 class="title">게임 준비중 입니다.</h2>

    <template v-if="canPick">
      <p class="muted">들어갈 팀을 고르세요. 한 번 고르면 바꿀 수 없습니다.</p>
      <div class="teams">
        <button
          v-for="t in lobby"
          :key="t.teamId"
          type="button"
          class="team"
          :class="{ full: full(t) }"
          :disabled="busy || full(t)"
          @click="picked = t"
        >
          <span class="letter">{{ t.label }}</span>
          <span class="count mono">{{ t.count }} / {{ t.capacity }}명</span>
          <span v-if="full(t)" class="muted small">가득 참</span>
        </button>
      </div>
    </template>
    <p v-else-if="myTeam" class="muted">{{ myTeam.label }} 팀에 배정되었습니다. 진행자가 게임을 시작하면 화면이 바뀝니다.</p>
    <p v-else class="muted">진행자가 게임을 시작하면 화면이 바뀝니다.</p>

    <p v-if="error" class="error">{{ error }}</p>

    <ModalDialog
      :open="!!picked"
      :title="`${picked?.label} 팀으로 들어갈까요?`"
      message="한 번 고르면 바꿀 수 없습니다. 바꾸려면 진행자에게 요청하세요."
      confirm-label="들어가기"
      cancel-label="취소"
      :busy="busy"
      @confirm="join"
      @cancel="picked = null"
    />
  </div>
</template>

<style scoped>
.lobby { text-align: center; }
.title { font-size: 1.6rem; margin: 8px 0 12px; }
.teams { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 12px; }
.team {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px 10px;
  background: var(--surface);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.team:not(:disabled):hover { border-color: var(--blue); }
.team:disabled, .team:disabled:hover { background: var(--bg-soft); color: var(--ink); border-color: var(--line-soft); }
.team.full { opacity: 0.45; cursor: not-allowed; }
.letter { font-family: var(--font-display); font-size: 2.6rem; line-height: 1; }
.count { font-size: 0.95rem; }
.small { font-size: 0.75rem; }
</style>
