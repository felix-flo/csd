<script setup lang="ts">
/**
 * 최종장 진행 (관리자, docs/100 N2 + D7). 게임 진행 카드 안에서 final 상태일 때 보인다.
 *   ① 최종 투표: 팀별 투표 현황(득표는 마감 전 비공개) → 마감(미투표 = 기권) → 동점이면 가위바위보 결과 입력
 *   ② 결과 발표: 상금 화폐 + 마지막 라운드 발행량 전체 공개
 *   ③ 정산: 보상 % 발표 (재화를 정정했으면 다시 계산)
 *   ④ 테러리스트 공개 (docs/100 N4): 이름·팀·보상 전체 공개 → 게임 끝내기
 * 다음 단계 요청에 보고 있던 단계를 함께 보내 중복 클릭·관리자 2명 동시 조작을 막는다 (서버 stale 거부).
 */
import { computed, ref } from 'vue'
import type { GroupInfo } from '../../../shared/types'
import { FINAL_STEP_LABELS, ISSUE_TEAM_CODE, RESOURCE_LABELS, type AdminGameView, type Tiebreak } from '../../../shared/game'
import { api } from '../lib/api'
import { useGameStore } from '../stores/game'
import TeamMark from './TeamMark.vue'
import Icon from './Icon.vue'
import ModalDialog from './ModalDialog.vue'
import ResultsBoard from './ResultsBoard.vue'

const props = defineProps<{ groups: GroupInfo[] }>()
const game = useGameStore()
const view = computed(() => game.admin!)
const f = computed(() => view.value.state.final!)
const busy = ref(false)
const status = ref('')
const team = (id: number) => props.groups.find((g) => g.id === id)
const issuer = (kind: 'gem' | 'gold') => props.groups.find((g) => g.code === ISSUE_TEAM_CODE[kind])?.name ?? kind
const notVoted = computed(() => Math.max(0, f.value.votes.eligible - f.value.votes.done))
const isTie = computed(() => !!f.value.tally && f.value.tally.gem === f.value.tally.gold)
const steps = ['vote', 'result', 'settle', 'spy'] as const

async function run(label: string, fn: () => Promise<AdminGameView>) {
  busy.value = true
  status.value = ''
  try {
    game.setAdmin(await fn())
    status.value = label
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
    void game.load()
  } finally {
    busy.value = false
    modal.value = null
  }
}

type ModalKind = 'close' | 'result' | 'settle' | 'spy' | 'end'
const modal = ref<ModalKind | null>(null)
const modalText = computed(() => {
  switch (modal.value) {
    case 'close':
      return {
        title: '최종 투표를 마감할까요?',
        message: `투표 ${f.value.votes.done} / ${f.value.votes.eligible}명.${notVoted.value ? ` 아직 투표하지 않은 ${notVoted.value}명은 기권 처리됩니다.` : ''}\n마감하면 득표(보석 N표 · 골드 N표)가 전체에 공개되고, 더 이상 투표할 수 없습니다.`,
      }
    case 'result':
      return {
        title: '결과를 발표할까요?',
        message: `상금 화폐 ${f.value.adopted ? RESOURCE_LABELS[f.value.adopted] : ''}와(과) 마지막 라운드 발행량(${issuer('gem')} 보석 · ${issuer('gold')} 골드)을 전체에 공개합니다.`,
      }
    case 'settle':
      return { title: '정산을 발표할까요?', message: '지금 팀 재화로 보상 %를 계산해 전체에 공개합니다. 발표 뒤 재화를 정정하면 "다시 계산" 을 누르세요.' }
    case 'spy': {
      const n = view.value.spy.spies.length
      return { title: '테러리스트를 공개할까요?', message: n ? `테러리스트 ${n}명의 이름·팀·보상을 전체에 공개합니다.` : '테러리스트가 없었다고 전체에 알립니다.' }
    }
    case 'end':
      return { title: '게임을 끝낼까요?', message: '결과는 그대로 남고, 더 이상 진행할 수 없습니다.' }
    default:
      return { title: '', message: '' }
  }
})

function onConfirm() {
  switch (modal.value) {
    case 'close':
      return run('투표 마감', () => api.post('/api/admin/final/close'))
    case 'result':
      return run('결과 발표', () => api.post('/api/admin/final/next', { step: 'vote' }))
    case 'settle':
      return run('정산 발표', () => api.post('/api/admin/final/next', { step: 'result' }))
    case 'spy':
      return run('테러리스트 공개', () => api.post('/api/admin/final/next', { step: 'settle' }))
    case 'end':
      return run('게임 끝', () => api.post('/api/admin/final/next', { step: 'spy' }))
  }
}

function tiebreak(winner: Tiebreak) {
  return run('가위바위보 결과 입력', () => api.post('/api/admin/final/tiebreak', { winner }))
}
function recompute() {
  return run('정산 다시 계산', () => api.post('/api/admin/final/recompute'))
}
</script>

<template>
  <div class="final">
    <!-- 단계 표시는 맨 위 상태판에 있다 -->
    <p v-if="status" class="muted" style="margin: 0 0 6px">{{ status }}</p>

    <!-- ① 최종 투표 -->
    <template v-if="f.step === 'vote'">
      <div class="vote-head">
        <div>
          <h3>최종 투표</h3>
          <p class="muted">{{ view.state.lifeVote ? '1인 1표 + 라이프 투표권에 뽑힌 사람은 1표 더' : '1인 1표' }} · {{ f.closed ? '투표 마감됨' : '득표는 마감 전에는 관리자도 볼 수 없습니다' }}</p>
        </div>
        <p class="big-count mono"><strong>{{ f.votes.done }}</strong> / {{ f.votes.eligible }}명 투표</p>
      </div>
      <div class="bar"><span :style="{ width: `${f.votes.eligible ? (f.votes.done / f.votes.eligible) * 100 : 0}%` }" /></div>

      <ul class="team-votes">
        <li v-for="v in view.finalVotes" :key="v.teamId" :class="{ done: v.eligible > 0 && v.done >= v.eligible }">
          <p class="t"><TeamMark :color="team(v.teamId)?.color ?? ''" />{{ team(v.teamId)?.name }}</p>
          <p class="n mono"><strong>{{ v.done }}</strong> / {{ v.eligible }}</p>
          <p class="s">{{ v.eligible > 0 && v.done >= v.eligible ? '모두 투표함' : f.closed ? `${v.eligible - v.done}명 기권` : `${v.eligible - v.done}명 남음` }}</p>
        </li>
      </ul>

      <template v-if="!f.closed">
        <div class="final-act">
          <button class="big" :disabled="busy" @click="modal = 'close'">투표 마감</button>
          <span v-if="notVoted" class="muted">지금 마감하면 {{ notVoted }}명은 기권 처리됩니다</span>
        </div>
      </template>
      <template v-else>
        <div class="tally">
          <p :class="{ win: f.adopted === 'gem' }"><span><Icon name="gem" /> 보석<template v-if="f.adopted === 'gem'"> · 채택</template></span><strong class="mono">{{ f.tally?.gem }}표</strong></p>
          <p :class="{ win: f.adopted === 'gold' }"><span><Icon name="gold" /> 골드<template v-if="f.adopted === 'gold'"> · 채택</template></span><strong class="mono">{{ f.tally?.gold }}표</strong></p>
        </div>
        <div v-if="isTie" class="row tie">
          <span class="badge warn">동점</span>
          <span>가위바위보 결과:</span>
          <button :class="{ secondary: f.tiebreak !== 'white' }" :disabled="busy" @click="tiebreak('white')">{{ issuer('gem') }} 승 → 보석</button>
          <button :class="{ secondary: f.tiebreak !== 'yellow' }" :disabled="busy" @click="tiebreak('yellow')">{{ issuer('gold') }} 승 → 골드</button>
        </div>
        <div class="final-act">
          <button class="big" :disabled="busy || !f.adopted" @click="modal = 'result'">결과 발표 →</button>
          <span v-if="f.adopted" class="muted">채택 화폐: {{ RESOURCE_LABELS[f.adopted] }}</span>
          <span v-else class="blocker">동점입니다. 화이트·골드 리더 가위바위보 결과를 넣으세요</span>
        </div>
      </template>
    </template>

    <!-- ② 결과 발표 · ③ 정산 -->
    <template v-else>
      <ResultsBoard :final="f" :results="view.state.results" />
      <div class="final-act">
        <button v-if="f.step === 'result'" class="big" :disabled="busy" @click="modal = 'settle'">정산 발표 →</button>
        <template v-else-if="f.step === 'settle'">
          <button class="big" :disabled="busy" @click="modal = 'spy'">테러리스트 공개 →</button>
          <button class="secondary" :disabled="busy" @click="recompute">다시 계산</button>
        </template>
        <button v-else-if="f.step === 'spy'" class="big" :disabled="busy" @click="modal = 'end'">게임 끝내기</button>
      </div>
    </template>

    <ModalDialog
      :open="modal !== null"
      :title="modalText.title"
      :message="modalText.message"
      :confirm-label="modal === 'close' ? '마감' : modal === 'end' ? '끝내기' : modal === 'spy' ? '공개' : '발표'"
      cancel-label="닫기"
      :danger="false"
      :busy="busy"
      @confirm="onConfirm"
      @cancel="modal = null"
    />
  </div>
</template>

<style scoped>
h3 { font-size: 0.95rem; margin: 16px 0 6px; font-weight: 600; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.steps { display: flex; gap: 4px; list-style: none; margin: 8px 0 0; padding: 0; flex-wrap: wrap; }
.steps li { font-size: 0.87rem; font-weight: 600; padding: 4px 10px 6px; border-bottom: 2px solid transparent; color: var(--muted); }
.steps li.past { color: #b0b8c1; }
.steps li.cur { color: var(--ink); border-bottom-color: var(--ink); }
.tbl { border-collapse: collapse; font-size: 0.92rem; }
.tbl td { text-align: left; padding: 5px 12px 5px 0; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.blocker { color: var(--red); font-size: 0.88rem; }
.final :deep(.results) { margin: 0; padding: 0; background: none; box-shadow: none; }
/* 관리자 화면에서는 결과를 크게 (같은 부품을 쓰는 참가자 휴대폰 화면은 그대로) */
.final :deep(.results .adopted) { font-size: 2.2rem; margin-bottom: 8px; }
.final :deep(.results .votes) { font-size: 1.1rem; }
.final :deep(.results .shares) { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
@media (max-width: 1100px) { .final :deep(.results .shares) { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.final :deep(.results .shares li) { grid-template-columns: 1fr; grid-template-rows: auto; row-gap: 4px; padding: 14px 16px; }
.final :deep(.results .shares .share) { grid-column: 1; grid-row: auto; align-self: start; font-size: 2rem; }
.final :deep(.results .shares li.excluded .share) { font-size: 1.1rem; }
.final :deep(.results .spies) { margin-top: 18px; font-size: 1.1rem; }
.vote-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.vote-head h3 { margin: 0 0 4px; font-size: 1.13rem; font-weight: 700; }
.vote-head p { margin: 0; }
.big-count { margin: 0; font-size: 1.1rem; color: var(--muted); }
.big-count strong { font-size: 2.6rem; color: var(--ink); }
.bar { height: 8px; margin: 10px 0 14px; border-radius: 999px; background: var(--bg-soft); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--ink); transition: width 0.3s ease; }
.team-votes { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; list-style: none; margin: 0; padding: 0; }
.team-votes li { padding: 12px 14px; border-radius: var(--radius); background: var(--bg-soft); }
.team-votes li.done { background: var(--surface); box-shadow: inset 0 0 0 2px var(--ink); }
.team-votes p { margin: 0; }
.team-votes .t { display: flex; align-items: center; gap: 2px; font-weight: 700; }
.team-votes .n { margin-top: 6px; font-size: 1rem; color: var(--muted); }
.team-votes .n strong { font-size: 1.8rem; color: var(--ink); }
.team-votes .s { margin-top: 2px; font-size: 0.85rem; color: var(--muted); }
.final-act { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; }
.final-act .big { min-width: 240px; min-height: 48px; font-size: 1.05rem; }
.tally { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
.tally p { margin: 0; display: flex; align-items: baseline; justify-content: space-between; padding: 14px 16px; border-radius: var(--radius); background: var(--bg-soft); font-weight: 700; }
.tally p.win { background: var(--surface); box-shadow: inset 0 0 0 2px var(--ink); }
.tally strong { font-size: 2rem; }
.tie { gap: 8px; margin-top: 12px; align-items: center; }
</style>
