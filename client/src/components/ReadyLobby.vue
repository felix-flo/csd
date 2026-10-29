<script setup lang="ts">
/**
 * 게임 시작 전(설정·준비) 참가자 화면. 게임 화면 대신 "게임 준비중 입니다." 만 보여준다.
 * - 준비 상태이고 아직 팀이 없으면 팀을 고른다. 팀은 실제 이름 대신 A, B, C… 와 현재/최대 인원으로 표시, 꽉 찬 팀은 dim.
 * - 한 번 고르면 바꿀 수 없다 (바꾸려면 진행자가 수동 이동). 정원 경쟁은 서버가 판정하고 진 쪽은 "팀이 가득 찼습니다".
 * - 이름 입력(첫 로그인)은 GroupView 가 먼저 처리한다.
 * - 팀을 고르면 운명의 카드(태양/달, docs/100 N4)를 고른다 (FatePick, 1회). 고르고 나면 "팀 A · 🌙 달" 과 대기 문구를 시작 전까지 보여준다.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { FATE_LABELS, type Fate, type LobbyTeam } from '../../../shared/game'
import type { PublicUser } from '../../../shared/types'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import ModalDialog from './ModalDialog.vue'
import FatePick from './FatePick.vue'

const auth = useAuthStore()
const game = useGameStore()
const lobby = computed(() => game.state?.lobby ?? null)
const myTeam = computed(() => lobby.value?.find((t) => t.teamId === auth.user?.groupId) ?? null)
const canPick = computed(() => game.state?.status === 'ready' && auth.user?.groupId == null && !!lobby.value)

const picked = ref<LobbyTeam | null>(null)
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
    <template v-else-if="myTeam && fate">
      <p class="mine">
        <span class="letter">{{ myTeam.label }}</span> 팀 <span class="dot">·</span> {{ FATE_LABELS[fate] }}
      </p>
      <div class="tale">
        <!-- 봉인 문양: 천천히 도는 점선 궤도 + 원 + 마름모 속 "?" -->
        <svg class="seal" viewBox="0 0 120 120" aria-hidden="true">
          <g class="orbit">
            <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="1" stroke-dasharray="3 6" />
            <circle cx="60" cy="4" r="2.6" fill="currentColor" />
            <circle cx="116" cy="60" r="2.2" fill="currentColor" />
          </g>
          <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.2" />
          <path d="M60 22 L94 60 L60 98 L26 60 Z" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.8" />
          <path d="M60 36 L82 60 L60 84 L38 60 Z" fill="currentColor" fill-opacity="0.16" />
          <text x="60" y="70" text-anchor="middle" class="q">?</text>
        </svg>
        <p class="eyebrow">YOUR DESTINY HAS BEEN SEALED</p>
        <p class="tale-title">예정에 없던 이야기</p>
        <p class="body">작은 선택 하나가<br />모든 것을 바꿀 수도 있습니다.</p>
        <p class="hush">지금은 아무것도 묻지 마세요.</p>
      </div>
    </template>
    <p v-else-if="myTeam" class="muted">{{ myTeam.label }} 팀에 배정되었습니다. 진행자가 게임을 시작하면 화면이 바뀝니다.</p>
    <p v-else class="muted">진행자가 게임을 시작하면 화면이 바뀝니다.</p>

    <p v-if="error" class="error">{{ error }}</p>
    <FatePick v-if="showFatePick" @chosen="onChosen" />

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
.mine { font-size: 1.2rem; margin: 4px 0 16px; }
.mine .letter { font-size: 2rem; vertical-align: -0.15em; }
.mine .dot { color: var(--muted); margin: 0 4px; }
/* 대기 문구 — 사용자 샘플 구성(문양 · 영문 소제목 · 제목 · 본문 · 구분선 · 맺음말), 색은 운명의 카드(남색·금색) 톤 */
.tale {
  --gold: #e6c77a;
  margin: 0 auto;
  max-width: 440px;
  padding: 36px 28px 32px;
  border-radius: 16px;
  background: radial-gradient(ellipse at top, #1b2140 0%, #0d1020 75%);
  color: #f5efe0;
  box-shadow: 0 12px 32px rgba(8, 10, 20, 0.35), inset 0 0 0 1px rgba(230, 199, 122, 0.18);
}
.seal { display: block; width: 132px; height: 132px; margin: 0 auto 28px; color: var(--gold); overflow: visible; }
.seal .q { fill: var(--gold); font-size: 30px; font-weight: 700; font-family: system-ui, sans-serif; }
.orbit { transform-origin: 60px 60px; animation: orbit 24s linear infinite; }
@keyframes orbit { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .orbit { animation: none; } }
.eyebrow { margin: 0 0 14px; font-size: 0.78rem; letter-spacing: 0.12em; color: var(--gold); }
.tale-title { margin: 0 0 18px; font-size: clamp(1.8rem, 7vw, 2.4rem); font-weight: 700; line-height: 1.25; color: #fff; }
.body { margin: 0; font-size: 1.12rem; line-height: 1.8; color: rgba(245, 239, 224, 0.88); }
.hush { margin: 26px 0 0; padding-top: 22px; border-top: 1px solid rgba(245, 239, 224, 0.2); color: rgba(245, 239, 224, 0.55); font-size: 1rem; }
</style>
