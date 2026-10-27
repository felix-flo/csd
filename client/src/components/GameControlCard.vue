<script setup lang="ts">
/**
 * 게임 진행 (관리자): 준비 상태 점검·리더 지정·게임 시작 / 단계 넘기기 / 다음 날 / 게임 종료 / 등수 발표 / 리셋, 그리고 현재 단계의 팀별 현황.
 * - 준비 상태: 팀별 입장 현황(A 3/5)과 리더. 리더가 없는 팀이 있으면 시작할 수 없다. 팀을 고르지 않은 참가자는 시작할 때 비활성.
 * - 리셋은 어느 상태에서나: 참가자·진행자 계정과 모든 기록·알림을 지우고 설정 단계로 (리셋한 사람이 진행자면 본인도 로그아웃).
 * - 다음 단계 요청에 보고 있던 일차·단계를 함께 보내 중복 클릭·관리자 2명 동시 조작을 막는다 (서버 stale 거부).
 * - 리더 선출 동표(동표자 중 현 리더 없음)는 여기서 지정한다.
 * - 제재(대가 없는 제재)는 아직 없음. 추가 시 리더간 협의 패널에 "다음날 거래 제재 팀" 선택을 둔다.
 */
import { computed, reactive, ref, watch } from 'vue'
import type { AdminUser, GroupInfo } from '../../../shared/types'
import {
  PHASE_LABELS, PHASES, RESOURCE_LABELS, WAR_COST_KINDS, WAR_STATUS_LABELS, isLifeExempt, josa, rankTeams, teamLetter,
  type AdminGameView, type Resources, type ScoreMode, type TradeView, type WarCost, type WarResult,
} from '../../../shared/game'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { useGameStore } from '../stores/game'
import { useAuthStore } from '../stores/auth'
import TeamMark from './TeamMark.vue'
import ModalDialog from './ModalDialog.vue'
import ResourceRow from './ResourceRow.vue'

const props = defineProps<{ users: AdminUser[]; groups: GroupInfo[] }>()
const emit = defineEmits<{ updated: [users: AdminUser[]] }>()
const game = useGameStore()
const auth = useAuthStore()
const router = useRouter()
const view = computed(() => game.admin)
const s = computed(() => view.value?.state)
const busy = ref(false)
const status = ref('')

const nameOf = (id: number | null | undefined) => props.users.find((u) => u.id === id)?.name ?? (id == null ? '-' : `#${id}`)
const team = (id: number) => props.groups.find((g) => g.id === id)

const isLastDay = computed(() => !!s.value && s.value.day >= (s.value.totalDays ?? 0))
/**
 * 게임 종료: 마지막 날에는 버튼을 계속 보여 주되, 그날 턴이 모두 끝나야(라이프 제출 단계 + 모든 팀 제출) 활성.
 * 서버도 같은 조건으로 막는다 (409 not_finished). 0·1명 팀은 제출 불필요라 완료로 본다
 */
const canEnd = computed(() => isLastDay.value && s.value?.phase === 'life' && !!s.value.livesDone && !warActive.value)
/** 아직 라이프를 제출하지 않은(제출 대상인) 팀 이름 */
const lifePending = computed(() =>
  (view.value?.teams ?? []).filter((t) => !t.lifeSubmission && t.activeMembers > 0 && !isLifeExempt(t.activeMembers)).map((t) => team(t.teamId)?.name ?? `#${t.teamId}`),
)
const endBlocker = computed(() => {
  if (!isLastDay.value || canEnd.value) return ''
  if (warActive.value) return '전쟁 결과를 먼저 정하세요'
  if (s.value?.phase !== 'life') return '마지막 날 라이프 제출 단계에서 모든 팀이 제출하면 종료할 수 있습니다'
  return `라이프 미제출: ${lifePending.value.join(', ')} — 모든 팀이 제출하면 종료할 수 있습니다`
})
// ---- 전쟁 (docs/99) ----
const warToday = computed(() => view.value?.war.today ?? null)
/** 진행 중 전쟁이 있으면 단계 넘기기·게임 종료 불가 (서버도 409 war_active) */
const warActive = computed(() => warToday.value?.status === 'declared')
const costText = (c: WarCost | null | undefined) =>
  !c ? '미정' : WAR_COST_KINDS.filter((k) => c[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${c[k]}`).join(', ') || '없음 (무료)'
/** 다음 날 선포 비용 입력 (저장해야 "다음 날로" 가 눌린다) */
const nextCost = reactive<WarCost>({ gem: 0, gold: 0, credit: 0 })
watch(() => view.value?.war.nextCost, (c) => Object.assign(nextCost, c ?? { gem: 0, gold: 0, credit: 0 }), { immediate: true })
function saveNextCost() {
  const day = (s.value?.day ?? 0) + 1
  const body = Object.fromEntries(WAR_COST_KINDS.map((k) => [k, Math.max(0, Math.floor(nextCost[k] || 0))]))
  return run(`${day}일차 전쟁 선포 비용 저장`, () => api.post('/api/admin/war/cost', body))
}
const warResult = ref<WarResult | null>(null)
function askWar(result: WarResult) {
  warResult.value = result
  modal.value = 'war'
}
/** 다음 단계/다음 날 버튼을 막는 이유 */
const advanceBlocker = computed(() => {
  if (warActive.value) return '⚔️ 전쟁 결과를 먼저 정하세요'
  if (!nextPhase.value && !isLastDay.value && !view.value?.war.nextCost) return `${(s.value?.day ?? 0) + 1}일차 전쟁 선포 비용을 아래 "전쟁" 에서 정해야 다음 날로 넘어갈 수 있습니다`
  return ''
})

const nextPhase = computed(() => {
  const p = s.value?.phase
  if (!p) return null
  const i = PHASES.indexOf(p)
  return i < PHASES.length - 1 ? PHASES[i + 1]! : null
})

interface ResetSummary { members: number; staff: number; events: number; clearedSettings: boolean }

async function run(label: string, fn: () => Promise<AdminGameView & { removedSelf?: boolean; reset?: ResetSummary }>) {
  busy.value = true
  status.value = ''
  resetDone.value = null
  try {
    const res = await fn()
    if (res.reset) resetDone.value = res.reset
    // 진행자가 리셋하면 본인 계정도 지워진다
    if (res.removedSelf) {
      auth.clear()
      void router.push('/login')
      return
    }
    game.setAdmin(res)
    status.value = label
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
    void game.load()
  } finally {
    busy.value = false
    modal.value = null
  }
}

// ---- 리셋: 설정값도 비울지 확인 팝업에서 고른다. 끝나면 지운 것/남은 것을 눈에 띄게 보여준다 ----
const clearSettings = ref(false)
const resetDone = ref<ResetSummary | null>(null)

// ---- 확인 팝업 ----
type ModalKind = 'next' | 'end' | 'reset' | 'cancelTrade' | 'start' | 'revert' | 'war'
const modal = ref<ModalKind | null>(null)
const modalText = computed(() => {
  const st = s.value
  if (!st) return { title: '', message: '' }
  switch (modal.value) {
    case 'next': {
      if (nextPhase.value) {
        const warn = st.phase === 'leader' && !st.leadersDone
          ? '\n투표가 끝나지 않은 팀은 지금까지의 표로 정하고, 표가 없거나 동표면 현재 리더를 유지합니다.'
          : st.phase === 'trade' && view.value?.trade ? '\n진행 중인 거래는 취소됩니다.' : ''
        return { title: `${PHASE_LABELS[nextPhase.value]} 단계로 넘길까요?`, message: `${st.day}일차 · ${PHASE_LABELS[st.phase!]} → ${PHASE_LABELS[nextPhase.value]}${warn}` }
      }
      const warn = st.livesDone ? '' : '\n아직 라이프를 제출하지 않은 팀이 있습니다. 미제출 팀은 라이프 소모·탈락 없이 넘어갑니다.'
      return { title: `${st.day + 1}일차로 넘길까요?`, message: `하루가 지나고 ${st.day + 1}일차 리더 선출이 시작됩니다.${warn}` }
    }
    case 'end':
      return { title: '게임을 종료할까요?', message: `${st.day}일차 모든 팀의 라이프 제출이 끝났습니다. 종료하면 더 이상 진행할 수 없고, 수락 대기 중인 발행 요청은 취소됩니다.\n환산 규칙을 골라 등수를 발표할 수 있습니다.` }
    case 'reset': {
      const self = !props.users.find((u) => u.id === auth.user?.id)?.isFixed
      return {
        title: '게임을 리셋할까요?',
        message: '참가자·진행자 계정을 모두 삭제하고(관리자·프레젠테이션 계정만 남음), 재화 이력·투표·거래·라이프 기록과 공지를 포함한 모든 알림을 지운 뒤 설정 단계로 돌아갑니다.\n'
          + '팀 구성·룰 문서는 남고 총 일수는 비웁니다. 테스트 계정은 같은 PIN 으로 다시 만들어집니다.'
          + (self ? '\n지금 로그인한 진행자 계정도 삭제되어 로그아웃됩니다.' : ''),
      }
    }
    case 'start': {
      const p = view.value?.prep
      const warn = p?.unassigned ? `\n팀을 고르지 않은 참가자 ${p.unassigned}명은 비활성(로그인 차단) 처리됩니다. 나중에 계정 관리에서 팀에 넣고 복귀시킬 수 있습니다.` : ''
      return { title: '게임을 시작할까요?', message: `총 ${st.totalDays}일. 시작하면 참가자 화면이 게임 화면으로 바뀌고 1일차 리더 선출이 열립니다.${warn}` }
    }
    case 'revert':
      return { title: '설정 단계로 되돌릴까요?', message: '참가자는 팀을 고를 수 없게 됩니다. 이미 팀을 고른 참가자와 PIN 은 그대로 남습니다.' }
    case 'cancelTrade':
      return { title: '진행 중인 거래를 취소할까요?', message: '이미 낸 크레딧은 돌려주지 않습니다.' }
    case 'war': {
      const w = warToday.value
      if (!w) return { title: '', message: '' }
      const a = team(w.attacker)?.name ?? '공격팀'
      const d = team(w.defender)?.name ?? '방어팀'
      const r = warResult.value
      if (r === 'attacker' || r === 'defender') {
        const win = r === 'attacker' ? a : d
        const lose = r === 'attacker' ? d : a
        return {
          title: `${win} 승리로 정할까요?`,
          message: `⚔️ ${a} → ${d}\n${lose}의 모든 재화(보석·골드·라이프·크레딧) 절반(내림)을 ${josa(win, '이/가')} 가져갑니다.\n결과는 전체에 알리고, 가져간 수량은 ${win}에게만 보입니다. 되돌릴 수 없습니다.`,
        }
      }
      if (r === 'draw') return { title: '무승부로 정할까요?', message: `⚔️ ${a} → ${d}\n재화 이동은 없고, 낸 선포 비용은 돌려주지 않습니다. 되돌릴 수 없습니다.` }
      return { title: '전쟁을 취소할까요?', message: `⚔️ ${a} → ${d}\n재화 이동은 없고, 낸 선포 비용은 돌려주지 않습니다. 오늘은 다시 선포할 수 없습니다.` }
    }
    default:
      return { title: '', message: '' }
  }
})

function onConfirm() {
  const st = s.value!
  switch (modal.value) {
    case 'next':
      return run('넘김', () => api.post('/api/admin/game/next', { day: st.day, phase: st.phase }))
    case 'end':
      return run('게임 종료', () => api.post('/api/admin/game/end'))
    case 'reset':
      return run('', () => api.post('/api/admin/game/reset', { clearSettings: clearSettings.value }))
    case 'cancelTrade':
      return run('거래 취소됨', () => api.post('/api/admin/game/trade/cancel'))
    case 'start':
      return run('게임 시작', () => api.post('/api/admin/game/start'))
    case 'revert':
      return run('설정 단계로 되돌림', () => api.post('/api/admin/game/revert'))
    case 'war':
      return run('전쟁 결과 지정', () => api.post(`/api/admin/war/${warToday.value!.id}/resolve`, { result: warResult.value }))
  }
}

// ---- 준비: 팀별 입장 현황 · 리더 지정 ----
const letterOfTeam = (teamId: number) => teamLetter(props.groups.findIndex((g) => g.id === teamId))
const lobbyOf = (teamId: number) => s.value?.lobby?.find((l) => l.teamId === teamId)
const membersOf = (teamId: number) => props.users.filter((u) => u.role === 'member' && u.active && u.groupId === teamId)
const leaderOf = (teamId: number) => membersOf(teamId).find((u) => u.isLeader)
async function pickLeader(e: Event) {
  const userId = Number((e.target as HTMLSelectElement).value)
  if (!userId) return
  busy.value = true
  status.value = ''
  try {
    const res = await api.post<{ users: AdminUser[] }>(`/api/admin/users/${userId}/leader`)
    emit('updated', res.users)
    await game.load()
    status.value = `${nameOf(userId)} 리더 지정`
  } catch (e2) {
    status.value = `실패: ${(e2 as Error).message}`
  } finally {
    busy.value = false
  }
}

// ---- 리더 동표 지정 ----
const tiePick = ref<Record<number, number>>({})
function resolveTie(teamId: number) {
  const userId = tiePick.value[teamId]
  if (!userId) return
  return run(`${team(teamId)?.name} 리더 지정`, () => api.post('/api/admin/game/election', { teamId, userId }))
}

// ---- 거래 표시 ----
const TRADE_STATUS: Record<string, string> = {
  requested: '요청 대기',
  awaiting_credit: '크레딧 제출 대기',
  negotiating: '제안·수락 중',
}
const offerText = (o: Resources | null) =>
  o ? (Object.entries(o).filter(([, n]) => n > 0).map(([k, n]) => `${RESOURCE_LABELS[k as keyof Resources]} ${n}`).join(', ') || '없음') : '제안 전'
const tradeLine = (t: TradeView) => `${team(t.from.teamId)?.name} → ${team(t.to.teamId)?.name}`

// ---- 등수 ----
const mode = ref<ScoreMode>('ratio')
const ratioGem = ref(1)
const ratioGold = ref(1)
const rule = computed(() => ({ mode: mode.value, gem: Math.max(0, ratioGem.value || 0), gold: Math.max(0, ratioGold.value || 0) }))
const preview = computed(() => {
  if (!view.value) return []
  return rankTeams(
    view.value.teams.map((t) => ({ teamId: t.teamId, name: team(t.teamId)?.name ?? '', color: team(t.teamId)?.color ?? '', gem: t.resources.gem, gold: t.resources.gold })),
    rule.value,
  )
})
function publish() {
  return run('등수 발표됨', () => api.post('/api/admin/game/results', rule.value))
}
</script>

<template>
  <div v-if="view && s" class="card">
    <h2>게임 진행</h2>

    <div class="row controls">
      <span v-if="s.status === 'setup'" class="mono"><strong>게임 설정 중</strong> · 아래 "게임 설정" 카드에서 초기셋팅완료</span>
      <template v-else-if="s.status === 'ready'">
        <span class="mono"><strong>게임 준비 중</strong> · 참가자 입장·팀 선택</span>
        <button class="secondary" :disabled="busy" @click="modal = 'revert'">설정으로 되돌리기</button>
        <button :disabled="busy || view.prep.noLeader.length > 0 || !view.settings.warCost" :title="view.prep.noLeader.length ? '리더가 없는 팀이 있습니다' : ''" @click="modal = 'start'">게임 시작</button>
        <span v-if="!view.settings.warCost" class="blocker">아래 "게임 설정" 에서 1일차 전쟁 선포 비용을 저장하세요</span>
        <span v-if="view.prep.noLeader.length" class="blocker">
          리더 미지정: {{ view.prep.noLeader.map(letterOfTeam).join(', ') }} 팀 — 아래 표에서 리더를 고르면 시작할 수 있습니다
        </span>
      </template>
      <template v-else-if="s.status === 'running'">
        <span class="mono">{{ s.day }}일차 / 총 {{ s.totalDays }}일 · <strong>{{ PHASE_LABELS[s.phase!] }}</strong></span>
        <button v-if="nextPhase" :disabled="busy || !!advanceBlocker" @click="modal = 'next'">다음 단계: {{ PHASE_LABELS[nextPhase] }} →</button>
        <button v-else-if="!isLastDay" :disabled="busy || !!advanceBlocker" @click="modal = 'next'">다음 날로 ({{ s.day + 1 }}일차) →</button>
        <span v-if="advanceBlocker && (nextPhase || !isLastDay)" class="blocker">{{ advanceBlocker }}</span>
        <button v-if="isLastDay" :disabled="busy || !canEnd" class="danger" @click="modal = 'end'">게임 종료</button>
        <span v-if="endBlocker" class="blocker">{{ endBlocker }}</span>
      </template>
      <span v-else class="mono"><strong>게임 종료</strong></span>
      <span class="spacer" />
      <button class="secondary" :disabled="busy" @click="clearSettings = false; modal = 'reset'">게임 리셋</button>
    </div>
    <p class="muted" style="min-height: 1.2em; margin: 6px 0 0">{{ status }}</p>
    <div v-if="resetDone" class="reset-done">
      <strong>리셋 완료</strong> · 참가자 {{ resetDone.members }}명 · 진행자 {{ resetDone.staff }}명 · 알림 {{ resetDone.events }}건 삭제, 테스트 계정은 같은 PIN 으로 다시 생성.
      <br />
      <template v-if="resetDone.clearedSettings">게임 설정값(최대 인원·초기 재화·라이프 매장량)도 0 으로 비웠습니다 (발행 한도는 기본값 250·200).</template>
      <template v-else>게임 설정값(최대 인원·초기 재화·라이프 매장량)은 이전 값을 남겼습니다. 아래 "게임 설정" 카드에서 수정하세요.</template>
      <button class="secondary small" type="button" @click="resetDone = null">닫기</button>
    </div>

    <!-- 준비: 팀별 입장 현황 · 리더 지정 -->
    <template v-if="s.status === 'ready'">
      <h3>팀 입장 현황</h3>
      <table class="tbl">
        <thead><tr><th>팀</th><th>입장 / 최대</th><th>리더</th></tr></thead>
        <tbody>
          <tr v-for="(g, i) in groups" :key="g.id">
            <td><span class="mono letter">{{ teamLetter(i) }}</span> <TeamMark :color="g.color" />{{ g.name }}</td>
            <td class="mono">{{ lobbyOf(g.id)?.count ?? 0 }} / {{ lobbyOf(g.id)?.capacity ?? 0 }}<span v-if="membersOf(g.id).some((u) => u.isTest)" class="muted"> + 테스트 {{ membersOf(g.id).filter((u) => u.isTest).length }}</span></td>
            <td>
              <span v-if="membersOf(g.id).length === 0" class="muted">팀원 없음</span>
              <span v-else class="row" style="gap: 6px">
                <span v-if="!leaderOf(g.id)" class="badge warn">리더 미지정</span>
                <select :value="leaderOf(g.id)?.id ?? ''" :disabled="busy" @change="pickLeader">
                  <option value="" disabled>리더 선택</option>
                  <option v-for="u in membersOf(g.id)" :key="u.id" :value="u.id">{{ u.name }}{{ u.isTest ? ' (테스트)' : '' }}</option>
                </select>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="muted" style="margin: 8px 0 0">
        팀을 고르지 않은 참가자 {{ view.prep.unassigned }}명<template v-if="view.prep.unassigned"> · 시작하면 비활성 처리됩니다</template>.
        <template v-if="view.prep.noLeader.length"> 리더가 없는 팀이 있어 시작할 수 없습니다.</template>
        팀 이동은 아래 "계정 관리"에서 할 수 있습니다.
      </p>
    </template>

    <!-- 리더 선출 -->
    <template v-if="s.status === 'running' && s.phase === 'leader'">
      <h3>리더 선출 <span v-if="s.leadersDone" class="badge on">모든 팀 완료</span></h3>
      <table class="tbl">
        <tbody>
          <tr v-for="t in view.teams" :key="t.teamId">
            <td><TeamMark :color="team(t.teamId)?.color ?? ''" />{{ team(t.teamId)?.name }}</td>
            <td>
              <template v-if="!t.election">-</template>
              <template v-else-if="t.election.status === 'voting'">투표 {{ t.election.voted.length }} / {{ t.election.voters }}</template>
              <template v-else-if="t.election.status === 'done'">완료 · 리더 <strong>{{ nameOf(t.election.leaderId) }}</strong></template>
              <span v-else class="row">
                <span class="badge warn">동표</span>
                <select v-model="tiePick[t.teamId]">
                  <option :value="undefined" disabled>동표자 선택</option>
                  <option v-for="id in t.election.tied" :key="id" :value="id">{{ nameOf(id) }} ({{ t.election.tally?.[id] }}표)</option>
                </select>
                <button class="small" :disabled="busy || !tiePick[t.teamId]" @click="resolveTie(t.teamId)">리더 지정</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- 생산 -->
    <p v-if="s.status === 'running' && s.phase === 'production'" class="muted">
      오프라인 미니게임 결과를 아래 "팀 재화" 카드에서 "생산" 으로 입력하세요. 라이프는 남은 매장량({{ view.lifeReserve }}) 안에서만 지급됩니다.
    </p>

    <!-- 거래 -->
    <template v-if="s.status === 'running' && s.phase === 'trade'">
      <h3>거래</h3>
      <p v-if="!view.trade" class="muted">진행 중인 거래 없음</p>
      <div v-else class="trade">
        <div><strong>{{ tradeLine(view.trade) }}</strong> <span class="badge warn">{{ TRADE_STATUS[view.trade.status] }}</span></div>
        <div v-if="view.trade.creditPayer" class="muted">크레딧 제출: {{ team(view.trade.creditPayer)?.name }}</div>
        <div v-if="view.trade.status === 'negotiating'" class="muted">
          {{ team(view.trade.from.teamId)?.name }}: {{ offerText(view.trade.from.offer) }}{{ view.trade.from.accepted ? ' ✓수락' : '' }}
          · {{ team(view.trade.to.teamId)?.name }}: {{ offerText(view.trade.to.offer) }}{{ view.trade.to.accepted ? ' ✓수락' : '' }}
        </div>
        <button class="secondary small" :disabled="busy" @click="modal = 'cancelTrade'">강제 취소</button>
      </div>
    </template>

    <!-- 전쟁: 오늘 비용·진행 중 전쟁 결과 지정·다음 날 비용 -->
    <template v-if="s.status === 'running'">
      <h3>⚔️ 전쟁</h3>
      <p class="muted" style="margin-top: 0">
        오늘({{ s.day }}일차) 선포 비용: <strong>{{ costText(view.war.todayCost) }}</strong> · 거래 활동 단계에서 리더가 하루 1회(게임 전체) 선포. 낸 비용은 소멸합니다.
      </p>
      <div v-if="warToday && warActive" class="war-active">
        <div><strong>⚔️ 전쟁 중: {{ team(warToday.attacker)?.name }} → {{ team(warToday.defender)?.name }}</strong> <span class="muted">(비용 {{ costText(warToday.cost) }})</span></div>
        <div class="muted">오프라인 게임 결과를 지정하세요. 결과가 나올 때까지 모든 거래와 단계 넘기기가 멈춥니다.</div>
        <div class="row" style="margin-top: 6px">
          <button class="danger" :disabled="busy" @click="askWar('attacker')">{{ team(warToday.attacker)?.name }} 승리</button>
          <button class="danger" :disabled="busy" @click="askWar('defender')">{{ team(warToday.defender)?.name }} 승리</button>
          <button class="secondary" :disabled="busy" @click="askWar('draw')">무승부</button>
          <button class="secondary" :disabled="busy" @click="askWar('cancel')">전쟁 취소</button>
        </div>
      </div>
      <p v-else-if="warToday">
        오늘 전쟁: {{ team(warToday.attacker)?.name }} → {{ team(warToday.defender)?.name }} · <strong>{{ WAR_STATUS_LABELS[warToday.status] }}</strong>
        <span v-if="warToday.spoils" class="muted"> · 전리품 {{ offerText(warToday.spoils) }}</span>
      </p>
      <p v-else class="muted">오늘 선포된 전쟁 없음</p>
      <div v-if="!isLastDay" class="row war-cost">
        <span>{{ s.day + 1 }}일차 선포 비용</span>
        <label v-for="k in WAR_COST_KINDS" :key="k">{{ RESOURCE_LABELS[k] }} <input v-model.number="nextCost[k]" type="number" min="0" /></label>
        <button class="secondary small" :disabled="busy" @click="saveNextCost">저장</button>
        <span v-if="view.war.nextCost" class="muted">저장됨: {{ costText(view.war.nextCost) }}</span>
        <span v-else class="blocker">아직 정하지 않음 — 정해야 다음 날로 넘어갑니다</span>
      </div>
    </template>

    <!-- 리더간 협의 -->
    <p v-if="s.status === 'running' && s.phase === 'council'" class="muted">
      대가 없는 원조는 아래 "팀 재화" 카드의 원조 입력으로 처리합니다 (주는 팀 라운드당 1회{{ view.aidsToday.length ? ` · 이번 라운드 ${view.aidsToday.length}건` : '' }}).
      제재 기능은 아직 없습니다. 전쟁은 거래 활동 단계에서 선포됩니다 (아래 "전쟁").
    </p>

    <!-- 라이프 제출 -->
    <template v-if="s.status === 'running' && s.phase === 'life'">
      <h3>라이프 제출 <span v-if="s.livesDone" class="badge on">모든 팀 제출</span></h3>
      <table class="tbl">
        <tbody>
          <tr v-for="t in view.teams" :key="t.teamId">
            <td><TeamMark :color="team(t.teamId)?.color ?? ''" />{{ team(t.teamId)?.name }}</td>
            <td>
              <template v-if="t.lifeSubmission">
                제출 · 생존 {{ t.lifeSubmission.saved.map(nameOf).join(', ') }}
                <template v-if="t.lifeSubmission.livesUsed">(라이프 {{ t.lifeSubmission.livesUsed }})</template>
                <template v-else>(라이프 0 · 1명 생존)</template>
                <span v-if="t.lifeSubmission.selfEliminated" class="badge">리더 자진 탈락</span>
                <span v-if="t.lifeSubmission.eliminated.length" class="error"> · 탈락 {{ t.lifeSubmission.eliminated.map(nameOf).join(', ') }}</span>
              </template>
              <span v-else-if="t.activeMembers === 0" class="muted">활성 팀원 없음</span>
              <span v-else-if="isLifeExempt(t.activeMembers)" class="muted">제출 불필요 · 팀원 1명 (자동 생존, 라이프 {{ t.resources.life }} 유지)</span>
              <span v-else class="muted">미제출 (라이프 {{ t.resources.life }} · 팀원 {{ t.activeMembers }}명)</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- 종료: 등수 -->
    <template v-if="s.status === 'ended'">
      <h3>등수 계산</h3>
      <div class="row">
        <label class="row" style="gap: 4px"><input v-model="mode" type="radio" value="gem" /> 보석만</label>
        <label class="row" style="gap: 4px"><input v-model="mode" type="radio" value="gold" /> 골드만</label>
        <label class="row" style="gap: 4px"><input v-model="mode" type="radio" value="ratio" /> 비율</label>
        <template v-if="mode === 'ratio'">
          보석 × <input v-model.number="ratioGem" type="number" min="0" style="width: 4.5em" />
          + 골드 × <input v-model.number="ratioGold" type="number" min="0" style="width: 4.5em" />
        </template>
      </div>
      <table class="tbl" style="margin-top: 8px">
        <thead><tr><th>순위</th><th>팀</th><th>보석</th><th>골드</th><th>점수</th></tr></thead>
        <tbody>
          <tr v-for="t in preview" :key="t.teamId">
            <td class="mono">{{ t.rank }}위</td>
            <td><TeamMark :color="t.color" />{{ t.name }}</td>
            <td class="mono">{{ t.gem }}</td>
            <td class="mono">{{ t.gold }}</td>
            <td class="mono"><strong>{{ t.score }}</strong></td>
          </tr>
        </tbody>
      </table>
      <div class="row" style="margin-top: 10px">
        <button :disabled="busy || (mode === 'ratio' && rule.gem + rule.gold === 0)" @click="publish">등수 발표 (프레젠테이션 표시)</button>
        <span v-if="s.results" class="muted">발표됨 · {{ new Date(s.results.publishedAt).toLocaleTimeString('ko-KR') }} (다시 누르면 갱신)</span>
      </div>
    </template>

    <template v-if="s.status === 'running'">
      <h3>초기 재화 합계 <span class="muted">(프레젠테이션 공개)</span></h3>
      <ResourceRow :amounts="s.initialTotals" />
    </template>

    <ModalDialog
      :open="modal !== null"
      :title="modalText.title"
      :message="modalText.message"
      :confirm-label="modal === 'reset' ? '리셋' : modal === 'end' ? '종료' : modal === 'start' ? '시작' : modal === 'war' ? '결과 확정' : '확인'"
      cancel-label="취소"
      :danger="modal === 'reset' || modal === 'end' || modal === 'cancelTrade' || modal === 'war'"
      :busy="busy"
      @confirm="onConfirm"
      @cancel="modal = null"
    >
      <label v-if="modal === 'reset'" class="row clear-opt">
        <input v-model="clearSettings" type="checkbox" />
        게임 설정값(팀별 최대 인원·초기 재화·라이프 매장량)도 0 으로 초기화 (발행 한도는 기본값 250·200 으로)
      </label>
    </ModalDialog>
  </div>
</template>

<style scoped>
h3 { font-size: 0.95rem; margin: 16px 0 6px; font-weight: 600; }
.controls { align-items: center; }
.spacer { flex: 1; }
.tbl { border-collapse: collapse; font-size: 0.92rem; }
.tbl th, .tbl td { text-align: left; padding: 5px 12px 5px 0; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.tbl th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
.letter { display: inline-block; min-width: 1.4em; font-weight: 600; }
.war-active { border: 2px solid var(--red); border-left-width: 6px; border-radius: var(--radius); background: var(--red-bg); padding: 10px 12px; }
.war-active strong { color: var(--red); }
.war-cost { gap: 8px; align-items: center; margin-top: 6px; }
.war-cost input { width: 5em; padding: 3px 6px; }
.blocker { color: var(--red); font-size: 0.88rem; }
.trade { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
button.small { padding: 4px 10px; font-size: 0.85rem; }
.reset-done { margin-top: 8px; padding: 10px 12px; border: 1px solid var(--line); border-left: 3px solid var(--blue); border-radius: var(--radius); background: var(--bg-soft); line-height: 1.6; }
.reset-done button { margin-left: 8px; }
.clear-opt { gap: 8px; align-items: flex-start; flex-wrap: nowrap; font-size: 0.92rem; cursor: pointer; }
.clear-opt input { flex: none; margin-top: 3px; }
</style>
