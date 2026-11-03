<script setup lang="ts">
/**
 * 게임 시작 전(설정·준비) 참가자 화면. 로그인처럼 위쪽 막대 없이 따로 뜨는 페이지다.
 * - 준비 상태이고 아직 팀이 없으면 팀을 고른다. 팀은 실제 이름 대신 A, B, C… 와 현재/최대 인원으로 표시, 꽉 찬 팀은 흐리게.
 *   칸을 눌러 고르고 → 아래 버튼 → 시트에서 한 번 더 확인하면 들어간다.
 * - 한 번 고르면 바꿀 수 없다 (바꾸려면 진행자가 수동 이동). 정원 경쟁은 서버가 판정하고 진 쪽은 "팀이 가득 찼어요".
 * - 이름 입력(첫 로그인)은 GroupView 가 먼저 처리한다.
 * - 팀을 고르면 운명의 카드(천사/악마, docs/100 N4)를 고른다 (FatePick, 1회). 고르고 나면 시작 전까지 전체 화면 대기 문구를 보여준다.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { FATE_LABELS, type Fate, type LobbyTeam } from '../../../shared/game'
import type { PublicUser } from '../../../shared/types'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import ModalDialog from './ModalDialog.vue'
import FixedBottomCta from './FixedBottomCta.vue'
import FatePick from './FatePick.vue'

const auth = useAuthStore()
const game = useGameStore()
const lobby = computed(() => game.state?.lobby ?? null)
const myTeam = computed(() => lobby.value?.find((t) => t.teamId === auth.user?.groupId) ?? null)
const canPick = computed(() => game.state?.status === 'ready' && auth.user?.groupId == null && !!lobby.value)

const picked = ref<LobbyTeam | null>(null)
const asking = ref(false)
const busy = ref(false)
const error = ref('')

const full = (t: LobbyTeam) => t.count >= t.capacity

// ---- 운명의 카드 (준비 상태 · 팀을 고른 뒤) ----
const fate = ref<Fate | null>(null)
const fateLoaded = ref(false)
async function loadFate() {
  if (game.state?.status !== 'ready' || auth.user?.groupId == null) return
  try {
    fate.value = (await api.get<{ fate: Fate | null }>('/api/game/fate')).fate
    fateLoaded.value = true
  } catch { /* 다음 갱신 때 */ }
}
onMounted(loadFate)
watch(() => [game.state?.status, auth.user?.groupId], loadFate)
const showFatePick = computed(() => game.state?.status === 'ready' && auth.user?.groupId != null && fateLoaded.value && fate.value == null)
function onChosen() {
  void loadFate()
}

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
    asking.value = false
    void game.load()
  }
}
</script>

<template>
  <div class="lobby">
    <h1>게임 준비중입니다</h1>

    <template v-if="canPick">
      <p class="muted">들어갈 팀을 고르세요. 한 번 고르면 바꿀 수 없습니다.</p>
      <div class="teams">
        <button
          v-for="t in lobby"
          :key="t.teamId"
          type="button"
          class="team"
          :class="{ on: picked?.teamId === t.teamId }"
          :aria-pressed="picked?.teamId === t.teamId"
          :disabled="busy || full(t)"
          @click="picked = t"
        >
          <span class="letter">{{ t.label }}</span>
          <span class="count mono muted">{{ full(t) ? '가득 참' : `${t.count} / ${t.capacity}` }}</span>
        </button>
      </div>
      <FixedBottomCta :label="picked ? `${picked.label} 팀 선택` : '팀 선택'" :disabled="!picked" :busy="busy" @click="asking = true" />
    </template>
    <div v-else-if="myTeam && fate" class="sealed">
      <p class="who mono">{{ myTeam.label }} 팀 · {{ FATE_LABELS[fate] }}</p>
      <p class="eyebrow">YOUR DESTINY HAS BEEN SEALED</p>
      <p class="tale">예정에 없던 이야기</p>
      <p class="body">작은 선택 하나가<br />모든 것을 바꿀 수도 있습니다.</p>
      <p class="hush">지금은 아무것도 묻지 마세요.</p>
    </div>
    <p v-else-if="myTeam" class="muted">{{ myTeam.label }} 팀에 배정되었습니다. 진행자가 게임을 시작하면 화면이 바뀝니다.</p>
    <p v-else class="muted">진행자가 게임을 시작하면 화면이 바뀝니다.</p>

    <p v-if="error" class="error">{{ error }}</p>
    <FatePick v-if="showFatePick" @chosen="onChosen" />

    <ModalDialog
      sheet
      :open="asking"
      :title="`${picked?.label} 팀으로 들어갈까요?`"
      message="한 번 고르면 바꿀 수 없습니다."
      confirm-label="네, 들어갑니다"
      cancel-label="다시 고르기"
      :busy="busy"
      @confirm="join"
      @cancel="asking = false"
    />
  </div>
</template>

<style scoped>
.lobby { padding-top: 32px; }
h1 { font-size: 36px; margin-bottom: 4px; }
.teams { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
.team { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; height: 168px; padding: 0; border-radius: var(--radius-card); background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }
.team:hover { background: var(--surface); }
.team.on, .team.on:hover { box-shadow: inset 0 0 0 2px var(--ink); }
.team:disabled, .team:disabled:hover { background: var(--surface); opacity: 0.45; }
.letter { font-family: var(--font-display); font-weight: 400; font-size: 64px; line-height: 1.12; letter-spacing: -0.065em; }
.count { font-size: 15px; }
.sealed { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 32px; background: #111113; color: #edeef0; text-align: center; }
.sealed p { margin: 0; }
.who { font-size: 13px; font-weight: 600; color: #b0b4ba; }
.eyebrow { margin-top: 32px !important; font-size: 12px; letter-spacing: 0.14em; color: #b0b4ba; }
.tale { font-family: var(--font-display); font-size: 44px; line-height: 1.12; letter-spacing: -0.065em; }
.body { font-size: 16px; line-height: 1.6; }
.hush { margin-top: 12px !important; font-size: 13px; color: #b0b4ba; }
</style>
