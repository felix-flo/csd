<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 화면: 오른쪽 현재 단계 관리에 상태창과 지금 단계에서 할 일이 나온다. 게임 관리만 왼쪽 메뉴 화면으로 보낸다 (menu).
 * 게임 진행 (관리자): 준비 상태 점검·게임 시작 (리더는 1라운드 리더 선출부터) / 단계 넘기기 / 다음 날 / 게임 종료(= 최종장 시작) / 리셋, 그리고 현재 단계의 팀별 현황.
 * - 마지막 라운드 리더 협의: 필수 안건(라이프 투표권). 기본 반영, 리더 3명이 반대하면 관리자가 미반영 입력 (넘어가는 걸 막지 않음)
 * - 이주 (docs/100 N3): 대기 신청 목록·강제 취소. 대기 신청이 있으면 리더 협의 → 라이프 제출로 넘어가지 못한다
 * - 테러리스트 (docs/100 N4): 준비 상태에 운명의 카드 현황(천사·악마·미선택)과 후보(악마) 목록 → 체크해서 지정. 후보가 있으면 1명 이상 지정해야 시작.
 *   진행 중에는 테러리스트와 현재 적립금 (관리자만)
 * - 최종장(final): FinalControl (투표 마감·가위바위보·결과·정산)
 * - 준비 상태: 팀별 입장 현황(A 3/5)과 리더. 리더가 없는 팀이 있으면 시작할 수 없다. 팀을 고르지 않은 참가자는 시작할 때 비활성.
 * - 리셋은 어느 상태에서나: 참가자·진행자 계정과 모든 기록·알림을 지우고 설정 단계로 (리셋한 사람이 진행자면 본인도 로그아웃).
 * - 다음 단계 요청에 보고 있던 일차·단계를 함께 보내 중복 클릭·관리자 2명 동시 조작을 막는다 (서버 stale 거부).
 * - 리더 선출 단계: 팀이 오프라인 협의 결과를 알려 오면 여기서 팀별로 리더를 지정한다 (docs/100 §7-6, 투표 없음). 팀원 1명은 자동.
 * - 거래 단계 (docs/103 §10): 오프라인 협의 내용을 여기서 입력해 "거래 진행" → 확인 팝업(예/아니오) 뒤 바로 체결 (2026-11-02 리더 수락 삭제).
 * - 전쟁 (docs/103 §4): 리더 선포 즉시 시작. 여기서는 결과만 지정하고, 다음 단계로 리더 협의로 넘긴다된다.
 * - 화면 순서: 검은 상태창 → 지금 단계에서 할 일(이 카드의 stage). 생산게임 결과(ProductionForm)·원조(AidForm)도 여기서 입력한다.
 * - 리더 협의 (docs/103 §11·§12): 다음 라운드 전쟁 비용 → 원조 → 다음 라운드 전쟁 허용/제재.
 *   전쟁은 기본 허용, 리더 3명 이상이 제재 찬성 시 금지. 협의 전에 "전쟁 제재 금지" 를 켜면 안건에서 빠진다 (2026-11-03).
 */
import { computed, reactive, ref, watch } from 'vue'
import type { AdminUser, GroupInfo } from '../../../shared/types'
import {
  FINAL_STEP_LABELS, MIGRATION_CANCEL_LABELS, PHASE_LABELS, phaseLabel, phasesOf, RESOURCE_KINDS, RESOURCE_LABELS, WAR_COST_KINDS, warWinner, emptyResources, isLifeExempt, josa, teamLetter,
  type AdminGameView, type Phase, type Resources, type WarCost, type WarResult,
  OPENING_LABELS, OPENING_STEPS, ISSUE_TEAM_CODE,
} from '../../../shared/game'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { askConfirm } from '../lib/confirm'
import { useGameStore } from '../stores/game'
import { useAuthStore } from '../stores/auth'
import { teamInk } from '../lib/teamColor'
import TeamMark from './TeamMark.vue'
import TeamPicker from './TeamPicker.vue'
import ModalDialog from './ModalDialog.vue'
import GamePhaseBar from './GamePhaseBar.vue'
import NoticeBar from './NoticeBar.vue'
import TabLoginToggle from './TabLoginToggle.vue'
import FinalControl from './FinalControl.vue'
import ProductionForm from './ProductionForm.vue'
import AidForm from './AidForm.vue'
import ResultsBoard from './ResultsBoard.vue'

const props = defineProps<{ users: AdminUser[]; groups: GroupInfo[]; menu: string }>()
defineEmits<{ updated: [users: AdminUser[]]; notices: [] }>()
const game = useGameStore()
const auth = useAuthStore()
const router = useRouter()
const view = computed(() => game.admin)
const s = computed(() => view.value?.state)
const busy = ref(false)
const status = ref('')

const nameOf = (id: number | null | undefined) => props.users.find((u) => u.id === id)?.name ?? (id == null ? '-' : `#${id}`)
const team = (id: number) => props.groups.find((g) => g.id === id)

/** 지금 진행 중인 단계. 오프닝 동안에는 서버 값이 leader 로 들어가 있어도 아직 라운드가 아니다 */
const round = computed(() => (s.value?.status === 'running' && !s.value.opening ? s.value.phase : null))
const isLastDay = computed(() => !!s.value && s.value.day >= (s.value.totalDays ?? 0))
/**
 * 게임 종료: 마지막 날에는 버튼을 계속 보여 주되, 그날 턴이 모두 끝나야(라이프 제출 단계 + 모든 팀 제출) 활성.
 * 서버도 같은 조건으로 막는다 (409 not_finished). 0·1명 팀은 제출 불필요라 완료로 본다
 */
const canEnd = computed(() => isLastDay.value && s.value?.phase === 'life' && !!s.value.livesDone && !warBlocker.value)
/** 아직 라이프를 제출하지 않은(제출 대상인) 팀 이름 */
const lifePending = computed(() =>
  (view.value?.teams ?? []).filter((t) => !t.lifeSubmission && t.activeMembers > 0 && !isLifeExempt(t.activeMembers, t.resources.life)).map((t) => team(t.teamId)?.name ?? `#${t.teamId}`),
)
const endBlocker = computed(() => {
  if (!isLastDay.value || canEnd.value) return ''
  if (warBlocker.value) return warBlocker.value
  // 라이프 제출 전 단계에서는 빨간 경고를 띄우지 않는다 (버튼만 비활성. 이유는 버튼 툴팁으로)
  if (s.value?.phase !== 'life') return ''
  return `라이프 미제출: ${lifePending.value.join(', ')} — 모든 팀이 제출하면 종료할 수 있습니다`
})
// ---- 전쟁 (docs/99) ----
const warToday = computed(() => view.value?.war.today ?? null)
/** 진행 중 전쟁이 있으면 단계 넘기기·게임 종료 불가 (서버도 409 war_active) */
const warActive = computed(() => warToday.value?.status === 'declared')
const warBlocker = computed(() => (warActive.value ? '전쟁 결과를 먼저 정하세요' : ''))
/** 다음 라운드 전쟁 허용/제재 (리더 협의 단계, docs/103 §12) */
async function setWarAllowed(allowed: boolean) {
  const day = (s.value?.day ?? 0) + 1
  // 누르면 바로 전체에 공지되므로 확인을 한 번 받는다. 이미 공지한 값과 같으면 아무것도 하지 않는다
  if (view.value?.war.nextAllowed === allowed) return
  const what = allowed ? `${day}라운드 전쟁 허용` : `${day}라운드 전쟁 제재 (전쟁 선포 불가)`
  if (!(await askConfirm(`리더 협의 결과를 "${what}"으로 확정할까요?\n바로 전체에 공지됩니다.`))) return
  return run(what, () => api.post('/api/admin/war/allow', { allowed }))
}
/** 전쟁 제재 금지 on/off (리더 협의 단계 전에). 켜면 협의 안건에서 전쟁 제재가 빠진다 */
function setSanctionOff(on: boolean) {
  return run(`전쟁 제재 금지 ${on ? 'ON' : 'OFF'}`, () => api.post('/api/admin/war/sanction-off', { on }))
}
const costText = (c: WarCost | null | undefined) =>
  !c ? '미정' : WAR_COST_KINDS.filter((k) => c[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${c[k]}`).join(', ') || '없음 (무료)'
/** 다음 날 선포 비용 입력 (저장해야 "다음 날로" 가 눌린다) */
const nextCost = reactive<WarCost>({ gem: 0, gold: 0, credit: 0 })
watch(() => view.value?.war.nextCost, (c) => Object.assign(nextCost, c ?? { gem: 0, gold: 0, credit: 0 }), { immediate: true })
function saveNextCost() {
  const day = (s.value?.day ?? 0) + 1
  const body = Object.fromEntries(WAR_COST_KINDS.map((k) => [k, Math.max(0, Math.floor(nextCost[k] || 0))]))
  return run(`${day}라운드 전쟁 선포 비용 저장`, () => api.post('/api/admin/war/cost', body))
}
const warResult = ref<WarResult | null>(null)
function askWar(result: WarResult) {
  warResult.value = result
  modal.value = 'war'
}
// ---- 테러리스트 (docs/100 N4) ----
const spyPick = ref<number[]>([])
watch(() => view.value?.spy.selected, (ids) => (spyPick.value = [...(ids ?? [])]), { immediate: true })
const spyDirty = computed(() => [...spyPick.value].sort().join() !== [...(view.value?.spy.selected ?? [])].sort().join())
const spyBlocker = computed(() => {
  const sp = view.value?.spy
  if (!sp || !sp.candidates.length) return ''
  if (!sp.selected.length) return '악마를 고른 후보 중 테러리스트를 1명 이상 지정해 저장해야 시작할 수 있습니다'
  return ''
})
function saveSpies() {
  return run('테러리스트 지정 저장', () => api.put('/api/admin/spies', { userIds: spyPick.value }))
}
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
/** 보석·골드 발행 팀 (code 기준) */
const issuerId = (k: 'gem' | 'gold') => props.groups.find((g) => g.code === ISSUE_TEAM_CODE[k])?.id

// ---- 이주 (docs/100 N3) ----
const migrationOpenFrom = computed(() => view.value?.settings.migrationStartDay ?? 4)
const MIGRATION_STATUS: Record<string, string> = { accepted: '이주 완료', rejected: '거절' }
function cancelMigration(id: number) {
  return run('이주 신청 취소', () => api.post(`/api/admin/migration/${id}/cancel`))
}

// ---- 마지막 라운드 필수 안건: 남은 라이프를 최종 투표권으로 (docs/100 N2) ----
const lifeVoteOpen = computed(() => s.value?.status === 'running' && isLastDay.value && s.value.phase === 'council')
async function setLifeVote(passed: boolean) {
  if (s.value?.lifeVoteSet && !!s.value.lifeVote === passed) return
  const what = `라이프 투표권 ${passed ? '반영' : '미반영 (리더 3명 반대)'}`
  if (!(await askConfirm(`리더 협의 결과를 "${what}"으로 확정할까요?\n바로 전체에 공지됩니다.`))) return
  return run(what, () => api.post('/api/admin/game/life-vote', { passed }))
}

/** 다음 단계/다음 날 버튼을 막는 이유 */
const advanceBlocker = computed(() => {
  if (warBlocker.value) return warBlocker.value
  if (s.value?.phase === 'leader' && !s.value.leadersDone) return s.value.day > 1 ? '모든 팀의 재신임 결과를 입력해야 다음 단계로 넘어갈 수 있습니다' : '모든 팀의 리더를 지정해야 다음 단계로 넘어갈 수 있습니다'
  if (s.value?.phase === 'life' && !nextPhase.value && !s.value.livesDone) return '모든 팀이 라이프를 제출해야 다음 라운드로 넘어갈 수 있습니다'
  if (s.value?.phase === 'council' && !isLastDay.value && !view.value?.war.sanctionOff && view.value?.war.nextAllowed == null) return `${(s.value?.day ?? 0) + 1}라운드 전쟁 제재(허용/금지)를 확정해야 다음 단계로 넘어갈 수 있습니다`
  if (s.value?.phase === 'council' && view.value?.migrations.pending.length) return '처리하지 않은 이주 신청이 있습니다. 받는 팀 리더가 처리하거나 아래 "이주"에서 취소해야 라이프 제출로 넘어갈 수 있습니다'
  if (!nextPhase.value && !isLastDay.value && !view.value?.war.nextCost) return `${(s.value?.day ?? 0) + 1}라운드 전쟁 선포 비용을 현재 단계 관리에서 정해야 다음 라운드로 넘어갈 수 있습니다`
  return ''
})
/** 맨 위 상태창의 공용 숫자. 어느 메뉴에 있든 보여야 하는 것만 */
const facts = computed(() => {
  const v = view.value
  if (!v || !s.value) return []
  if (s.value.status === 'ready') {
    const lobby = s.value.lobby ?? []
    const total = lobby.reduce((n, t) => n + t.capacity, 0)
    return [
      { label: '입장', value: `${lobby.reduce((n, t) => n + t.count, 0)} / ${total}` },
      { label: '운명의 카드', value: `${v.spy.counts.sun + v.spy.counts.moon} / ${total}` },
    ]
  }
  if (s.value.status !== 'running') return []
  return [{ label: '참가자', value: `${v.teams.reduce((n, t) => n + t.activeMembers, 0)}명` }]
})
/** 맨 위 상태창에 띄울, 다음으로 넘어가지 못하는 이유 */
const headNote = computed(() => {
  if (!s.value || !view.value) return ''
  if (s.value.status === 'ready') return [spyBlocker.value, view.value.settings.warCost ? '' : '아래 게임 설정에서 1라운드 전쟁 선포 비용을 저장하세요'].filter(Boolean).join(' · ')
  if (!round.value) return ''
  return [nextPhase.value || !isLastDay.value ? advanceBlocker.value : '', endBlocker.value].filter(Boolean).join(' · ')
})

const nextPhase = computed(() => {
  const p = s.value?.phase
  if (!p) return null
  const phases = phasesOf(s.value!.day, s.value!.totalDays)
  const i = phases.indexOf(p)
  return i < phases.length - 1 ? phases[i + 1]! : null
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
type ModalKind = 'next' | 'end' | 'reset' | 'start' | 'revert' | 'war' | 'trade'
const modal = ref<ModalKind | null>(null)
const modalText = computed(() => {
  const st = s.value
  if (!st) return { title: '', message: '' }
  switch (modal.value) {
    case 'next': {
      if (nextPhase.value) {
        return { title: `${PHASE_LABELS[nextPhase.value]} 단계로 넘길까요?`, message: `${st.day}라운드 · ${phaseLabel(st.phase!, st.day)} → ${PHASE_LABELS[nextPhase.value]}` }
      }
      // 마지막 라운드로 넘어갈 때: 발행 허용 단계를 한 번 더 보여 준다 (넘어가면 바꿀 수 없다)
      const last = st.day + 1 >= (st.totalDays ?? 0)
        ? `\n\n${st.day + 1}라운드는 마지막 라운드입니다. 리더 협의와 라이프 제출 사이에 마지막 발행 단계가 들어갑니다.`
        : ''
      return { title: last ? `마지막 라운드(${st.day + 1}라운드)로 넘길까요?` : `${st.day + 1}라운드로 넘길까요?`, message: `이번 라운드가 끝나고 ${st.day + 1}라운드 리더 선출이 시작됩니다.${last}` }
    }
    case 'end': {
      const lv = st.lifeVote ? '1인 1표 + 팀마다 남은 라이프 수만큼 무작위로 뽑힌 사람은 2표 (1인 1장)' : '1인 1표'
      return {
        title: '게임을 종료하고 최종장을 시작할까요?',
        message: `${st.day}라운드 모든 팀의 라이프 제출이 끝났습니다. 거래·발행·원조는 더 이상 할 수 없습니다.\n최종 투표(보석 vs 골드)가 열립니다 · ${lv}.`,
      }
    }
    case 'reset': {
      const self = !props.users.find((u) => u.id === auth.user?.id)?.isFixed
      return {
        title: '게임을 리셋할까요?',
        message: '참가자·진행자 계정을 모두 삭제하고(관리자·프레젠테이션 계정만 남음), 재화 이력·투표·거래·라이프 기록과 공지를 포함한 모든 알림을 지운 뒤 설정 단계로 돌아갑니다.\n'
          + '팀 구성·룰 문서는 남고 총 라운드 수는 비웁니다. 테스트 계정은 같은 PIN 으로 다시 만들어집니다.'
          + (self ? '\n지금 로그인한 진행자 계정도 삭제되어 로그아웃됩니다.' : ''),
      }
    }
    case 'start': {
      const p = view.value?.prep
      const warn = p?.unassigned ? `\n팀을 고르지 않은 참가자 ${p.unassigned}명은 비활성(로그인 차단) 처리됩니다. 나중에 계정 관리에서 팀에 넣고 복귀시킬 수 있습니다.` : ''
      // 테스트 모드(탭 로그인)를 끄는 걸 잊지 않게 (docs/101)
      const sp = view.value?.spy
      const spyWarn = !sp ? '' : sp.selected.length
        ? `\n테러리스트 ${sp.selected.length}명: ${sp.selected.map(nameOf).join(', ')} (시작하면 본인에게만 무음으로 알립니다)`
        : '\n\n악마를 고른 후보가 없어 테러리스트 없이 시작합니다.'
      const fateWarn = sp?.counts.none ? `\n운명의 카드를 고르지 않은 ${sp.counts.none}명은 천사로 처리됩니다.` : ''
      const tab = view.value?.settings.tabLogin ? '\n\n테스트 모드(탭 로그인)가 켜져 있습니다. 참가자가 새 탭을 열 때마다 다시 로그인해야 합니다. 실제 진행이면 게임 설정의 테스트 칸에서 끄세요.' : ''
      return { title: '세팅을 완료할까요?', message: `총 ${st.totalDays}라운드. 완료하면 프레젠테이션에 "게임 진행" 버튼이 뜨고, 참가자 화면은 "앞 화면을 봐 주세요" 로 바뀝니다.${warn}${fateWarn}${spyWarn}${tab}` }
    }
    case 'revert':
      return { title: '설정 단계로 되돌릴까요?', message: '참가자는 팀을 고를 수 없게 됩니다. 이미 팀을 고른 참가자와 PIN 은 그대로 남습니다.' }
    case 'trade':
      return {
        title: '거래를 처리할까요?',
        message: `${tradeSummaryText.value}\n확인하면 바로 크레딧 1개(${team(tradeForm.creditPayer ?? 0)?.name ?? ''})가 빠지고 재화가 교환됩니다. 되돌릴 수 없습니다.`,
      }
    case 'war': {
      const w = warToday.value
      if (!w) return { title: '', message: '' }
      const a = team(w.attacker)?.name ?? '공격팀'
      const d = team(w.defender)?.name ?? '방어팀'
      const r = warResult.value
      const win = r === 'attacker' ? a : d
      const lose = r === 'attacker' ? d : a
      return {
        title: `${win} 승리로 정할까요?`,
        message: `${a} → ${d}\n${lose}의 보석·라이프·크레딧 절반(내림)을 ${josa(win, '이/가')} 가져갑니다. 골드는 그대로입니다.\n결과는 전체에 알리고, 오간 수량은 두 팀에게만 보입니다. 되돌릴 수 없습니다.`,
      }
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
    case 'start':
      return run('세팅 완료', () => api.post('/api/admin/game/start'))
    case 'revert':
      return run('설정 단계로 되돌림', () => api.post('/api/admin/game/revert'))
    case 'war':
      return run('전쟁 결과 지정', () => api.post(`/api/admin/war/${warToday.value!.id}/resolve`, { result: warResult.value }))
    case 'trade':
      return submitTrade()
  }
}

// ---- 준비: 팀별 입장 현황 ----
const letterOfTeam = (teamId: number) => teamLetter(props.groups.findIndex((g) => g.id === teamId))
const lobbyOf = (teamId: number) => s.value?.lobby?.find((l) => l.teamId === teamId)
const lobbyTotal = computed(() => (s.value?.lobby ?? []).reduce((a, l) => ({ count: a.count + l.count, capacity: a.capacity + l.capacity }), { count: 0, capacity: 0 }))
const membersOf = (teamId: number) => props.users.filter((u) => u.role === 'member' && u.active && u.groupId === teamId)
const leaderOf = (teamId: number) => membersOf(teamId).find((u) => u.isLeader)

// ---- 리더 선출 단계: 팀별 수동 지정 ----
const leaderPick = ref<Record<number, number>>({})
function designate(teamId: number) {
  const userId = leaderPick.value[teamId] ?? leaderOf(teamId)?.id
  if (!userId) return
  return run(`${team(teamId)?.name} 리더 지정: ${nameOf(userId)}`, () => api.post('/api/admin/game/leader', { teamId, userId }))
}

// ---- 거래 (docs/103 §10): 진행자가 내용을 입력해 올린다 ----
const offerText = (o: Resources | null) =>
  o ? (Object.entries(o).filter(([, n]) => n > 0).map(([k, n]) => `${RESOURCE_LABELS[k as keyof Resources]} ${n}`).join(', ') || '없음') : '-'
const tradeForm = reactive<{ from: number | null; to: number | null; creditPayer: number | null; fromOffer: Resources; toOffer: Resources }>({
  from: null, to: null, creditPayer: null, fromOffer: emptyResources(), toOffer: emptyResources(),
})
// 팀을 바꾸면 크레딧 부담 팀이 거래 팀 밖이 되지 않게
watch(() => [tradeForm.from, tradeForm.to], ([f, t]) => {
  if (tradeForm.creditPayer !== f && tradeForm.creditPayer !== t) tradeForm.creditPayer = f ?? null
})
const teamRes = (id: number | null) => view.value?.teams.find((t) => t.teamId === id)?.resources ?? emptyResources()
/** 보유량 초과·크레딧 부족 등 제출 전 점검 */
const tradeProblem = computed(() => {
  const f = tradeForm.from, t = tradeForm.to
  if (!f || !t) return '두 팀을 고르세요'
  if (f === t) return '같은 팀끼리는 거래할 수 없습니다'
  if (!tradeForm.creditPayer) return '크레딧을 낼 팀을 고르세요'
  if (RESOURCE_KINDS.every((k) => !tradeForm.fromOffer[k] && !tradeForm.toOffer[k])) return '교환할 재화를 입력하세요'
  for (const [id, offer] of [[f, tradeForm.fromOffer], [t, tradeForm.toOffer]] as const) {
    const own = teamRes(id)
    const need = { ...offer, credit: (offer.credit || 0) + (tradeForm.creditPayer === id ? 1 : 0) }
    const short = RESOURCE_KINDS.find((k) => (need[k] || 0) > own[k])
    if (short) return `${team(id)?.name}의 ${RESOURCE_LABELS[short]}이(가) 부족합니다 (필요 ${need[short]}, 보유 ${own[short]})`
  }
  return ''
})
const tradeSummaryText = computed(() =>
  `${team(tradeForm.from ?? 0)?.name} (${offerText(tradeForm.fromOffer)}) ↔ ${team(tradeForm.to ?? 0)?.name} (${offerText(tradeForm.toOffer)}) · 크레딧 ${team(tradeForm.creditPayer ?? 0)?.name} 부담`)
async function moveOpening(dir: 1 | -1) {
  if (s.value?.opening) await run('', () => api.post('/api/admin/game/opening', { step: s.value!.opening, dir }))
}
async function submitTrade() {
  const body = {
    fromTeamId: tradeForm.from, toTeamId: tradeForm.to, creditPayer: tradeForm.creditPayer,
    fromOffer: Object.fromEntries(RESOURCE_KINDS.map((k) => [k, Math.max(0, Math.floor(tradeForm.fromOffer[k] || 0))])),
    toOffer: Object.fromEntries(RESOURCE_KINDS.map((k) => [k, Math.max(0, Math.floor(tradeForm.toOffer[k] || 0))])),
  }
  await run(`거래 완료: ${tradeSummaryText.value}`, () => api.post('/api/admin/game/trade', body))
  Object.assign(tradeForm.fromOffer, emptyResources())
  Object.assign(tradeForm.toOffer, emptyResources())
}
const teamStyle = (id: number | null) => (id && team(id) ? { '--team': teamInk(team(id)!.color) ?? '' } : {})

</script>

<template>
  <template v-if="view && s">
  <!-- 어느 메뉴에서든 항상 보이는 부분: 지금 단계 + 다음 동작 + 넘어가지 못하는 이유. 진행판 맨 위 줄(#admin-head)로 보낸다 -->
  <Teleport defer to="#admin-head">
  <div class="ctrl">
    <div class="card ctrl-head">
      <div class="where">
        <p v-if="s.status === 'setup'" class="label"><strong>게임 설정 중</strong><span class="muted">설정을 마치고 초기셋팅완료를 누르세요</span></p>
        <p v-else-if="s.opening" class="label"><strong>오프닝</strong><span class="muted">{{ OPENING_LABELS[s.opening] }} · {{ OPENING_STEPS.indexOf(s.opening) + 1 }} / {{ OPENING_STEPS.length }}</span></p>
        <GamePhaseBar v-else />
      </div>
      <div class="acts" :class="{ stack: isLastDay && nextPhase }">
        <button v-if="s.status === 'ready'" class="lg" :disabled="busy || !view.settings.warCost || !!spyBlocker" @click="modal = 'start'">세팅 완료</button>
        <template v-else-if="s.status === 'running' && s.opening">
          <button class="secondary lg" :disabled="busy || s.opening === 'film'" @click="moveOpening(-1)">이전</button>
          <button class="lg" :disabled="busy" @click="moveOpening(1)">{{ s.opening === 'lunch' ? '1라운드 시작 →' : '다음 →' }}</button>
        </template>
        <template v-else-if="s.status === 'running'">
          <button v-if="nextPhase" class="lg" :disabled="busy || !!advanceBlocker" @click="modal = 'next'">다음 단계: {{ PHASE_LABELS[nextPhase] }} →</button>
          <button v-else-if="!isLastDay" class="lg" :disabled="busy || !!advanceBlocker" @click="modal = 'next'">다음 라운드로 ({{ s.day + 1 }}라운드) →</button>
          <button v-if="isLastDay" class="lg" :disabled="busy || !canEnd" :title="canEnd ? '' : '마지막 라운드 라이프 제출 단계에서 모든 팀이 제출하면 시작할 수 있습니다'" @click="modal = 'end'">최종장 시작 →</button>
        </template>
      </div>
      <NoticeBar class="head-notice" @open="$emit('notices')" />
      <ul v-if="facts.length" class="facts">
        <li v-for="f in facts" :key="f.label">{{ f.label }} <strong class="mono">{{ f.value }}</strong></li>
      </ul>
      <div v-if="headNote || status" class="notes">
        <p v-if="headNote" class="note">{{ headNote }}</p>
        <p v-if="status" class="note muted">{{ status }}</p>
      </div>
    </div>
  </div>
  </Teleport>

  <div v-if="resetDone" class="card reset-done">
    <strong>리셋 완료</strong> · 참가자 {{ resetDone.members }}명 · 진행자 {{ resetDone.staff }}명 · 알림 {{ resetDone.events }}건 삭제, 테스트 계정은 같은 PIN 으로 다시 생성.
    <br />
    <template v-if="resetDone.clearedSettings">게임 설정값(최대 인원·초기 재화 등)을 기본값으로 되돌렸습니다 (발행 한도도 기본값 250·200).</template>
    <template v-else>게임 설정값(최대 인원·초기 재화)은 이전 값을 남겼습니다. 진행판의 게임 설정에서 수정하세요.</template>
    <button class="secondary small" type="button" @click="resetDone = null">닫기</button>
  </div>

  <!-- 입장 현황 -->
  <section v-if="s.status === 'ready'" class="card sec">
    <div class="head-row">
      <h3>팀 입장 현황</h3>
      <p class="big-count mono"><strong>{{ lobbyTotal.count }}</strong> / {{ lobbyTotal.capacity }}명</p>
    </div>
    <ul class="lobby">
      <li v-for="(g, i) in groups" :key="g.id" :class="{ full: (lobbyOf(g.id)?.count ?? 0) >= (lobbyOf(g.id)?.capacity ?? 0) && (lobbyOf(g.id)?.capacity ?? 0) > 0 }">
        <p class="t"><span class="mono letter">{{ teamLetter(i) }}</span><TeamMark :color="g.color" />{{ g.name.replace(/ 팀$/, '') }}</p>
        <p class="n mono"><strong>{{ lobbyOf(g.id)?.count ?? 0 }}</strong> / {{ lobbyOf(g.id)?.capacity ?? 0 }}</p>
        <div class="mini-bar"><span :style="{ width: `${(lobbyOf(g.id)?.capacity ?? 0) ? Math.min(100, ((lobbyOf(g.id)?.count ?? 0) / (lobbyOf(g.id)?.capacity ?? 1)) * 100) : 0}%`, background: teamInk(g.color) ?? g.color }" /></div>
        <p v-if="membersOf(g.id).some((u) => u.isTest)" class="s">테스트 계정 {{ membersOf(g.id).filter((u) => u.isTest).length }}명 포함</p>
      </li>
    </ul>
    <p class="muted foot">
      팀 안 고른 참가자 {{ view.prep.unassigned }}명<template v-if="view.prep.unassigned"> (시작하면 비활성)</template> · 팀 이동은 "계정 관리"에서
    </p>
  </section>

  <!-- 운명의 카드 (docs/100 N4): 악마를 고른 후보만 나열하고, 그중에서 테러리스트를 지정한다 -->
  <section v-if="s.status === 'ready'" class="card sec">
    <div class="head-row">
      <h3><Icon name="devil" /> 테러리스트 지정</h3>
      <span class="muted">운명의 카드 {{ view.spy.counts.sun + view.spy.counts.moon }} / {{ view.spy.counts.sun + view.spy.counts.moon + view.spy.counts.none }}명 고름</span>
    </div>
    <p class="muted">악마를 고른 후보 {{ view.spy.candidates.length }}명 중에서 지정하세요.</p>
    <p v-if="!view.spy.candidates.length" class="muted">아직 악마를 고른 사람이 없습니다. 후보가 없으면 테러리스트 없이 시작합니다.</p>
    <template v-else>
      <ul class="cands">
        <li v-for="c in view.spy.candidates" :key="c.userId">
          <label :class="{ on: spyPick.includes(c.userId) }">
            <input v-model="spyPick" type="checkbox" :value="c.userId" :disabled="busy" />
            <span class="nm">{{ c.name }}<span v-if="c.isTest" class="muted"> (테스트)</span></span>
            <span class="tm"><TeamMark :color="team(c.teamId)?.color ?? ''" />{{ team(c.teamId)?.name }}</span>
          </label>
        </li>
      </ul>
      <div class="row spy-act">
        <button :disabled="busy || !spyDirty" @click="saveSpies">지정 저장 ({{ spyPick.length }}명)</button>
        <span v-if="view.spy.selected.length" class="muted">저장됨: {{ view.spy.selected.map(nameOf).join(', ') }}</span>
        <span v-else class="blocker">지정해야 시작할 수 있습니다</span>
      </div>
    </template>
  </section>

  <!-- 현재 단계: 지금 단계에서 할 일만. 한 가지 일 = 카드 하나. 꼭 해야 하는 일은 진한 테두리(stage).
       순서: 관리자가 골라야 하는 카드(pick) → 입력 카드 → 참고 카드(info) -->
  <template v-if="s.status !== 'setup' && s.status !== 'ready'">
    <div v-if="s.opening" class="card stage sec">
      <ol class="opening">
        <li v-for="o in OPENING_STEPS" :key="o" :class="{ cur: o === s.opening }">{{ OPENING_LABELS[o] }}</li>
      </ol>
    </div>

    <!-- 리더 선출 -->
    <section v-if="round === 'leader'" class="card stage sec">
      <h3>{{ s.day > 1 ? '리더 재신임' : '리더 선정' }} <span v-if="s.leadersDone" class="badge on">모든 팀 완료</span></h3>
      <div class="muted">{{ s.day > 1 ? '논의 결과를 입력하세요. 재신임이면 고르지 않고 재신임을 누르세요.' : '팀이 협의한 리더를 알려 오면 팀별로 지정하세요.' }}</div>
      <table class="tbl">
        <tbody>
          <tr v-for="t in view.teams" :key="t.teamId">
            <td><TeamMark :color="team(t.teamId)?.color ?? ''" />{{ team(t.teamId)?.name }}</td>
            <td>
              <template v-if="!t.election || membersOf(t.teamId).length === 0">-</template>
              <span v-else class="row">
                <span v-if="t.election.status === 'done'" class="badge on">지정 완료</span>
                <span v-else class="badge warn">대기</span>
                <select v-model="leaderPick[t.teamId]" class="leader-select">
                  <option :value="undefined" disabled>{{ (s.day > 1 || t.election.status === 'done') && leaderOf(t.teamId) ? `현재: ${leaderOf(t.teamId)?.name}` : '리더 선택' }}</option>
                  <option v-for="u in membersOf(t.teamId)" :key="u.id" :value="u.id">{{ u.name }}{{ s.day > 1 && u.isLeader ? ' (현재 리더)' : '' }}</option>
                </select>
                <button class="small" :disabled="busy || (!leaderPick[t.teamId] && (s.day === 1 || !leaderOf(t.teamId))) || membersOf(t.teamId).length === 1" :title="leaderPick[t.teamId] && leaderPick[t.teamId] !== leaderOf(t.teamId)?.id ? '' : '현재 리더를 그대로 확정합니다'" @click="designate(t.teamId)">{{ s.day === 1 ? '리더 지정' : leaderPick[t.teamId] && leaderPick[t.teamId] !== leaderOf(t.teamId)?.id ? '교체' : '재신임' }}</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 생산 -->
    <section v-if="round === 'production'" class="card stage sec">
      <h3><Icon name="trophy" /> 생산게임 결과 <span class="muted">팀마다 미니게임이 끝나면 입력 · 라운드마다 팀당 1번</span></h3>
      <ProductionForm :groups="groups" />
    </section>

    <section v-if="round === 'last_issue'" class="card stage sec">
      <h3><Icon name="lock" /> 마지막 발행</h3>
      <p class="muted">화이트와 골드 리더가 휴대폰에서 마지막 발행을 합니다. 발행량은 최종장 결과 전까지 공개되지 않습니다.</p>
      <ul class="issue-rows">
        <li v-for="k in (['gem', 'gold'] as const)" :key="k">
          <span class="who"><TeamMark :color="team(issuerId(k) ?? 0)?.color ?? ''" />{{ team(issuerId(k) ?? 0)?.name ?? (k === 'gem' ? '화이트 팀' : '골드 팀') }} · <Icon :name="k" /> {{ RESOURCE_LABELS[k] }}</span>
          <span v-if="view.issues?.issuedToday[k]" class="badge on">발행함 · {{ view.issues?.lastRound?.[k] ?? 0 }}개</span>
          <span v-else class="badge warn">아직 안 함</span>
          <span class="muted">남은 한도 {{ view.issues?.remaining[k] ?? '-' }}개</span>
        </li>
      </ul>
    </section>

    <!-- 거래 -->
    <section v-if="round === 'trade'" class="card sec" :class="warToday ? 'info' : 'stage'">
      <h3><Icon name="aid" /> 거래 <span class="muted">입력하면 바로 체결됩니다</span></h3>
      <div v-if="warToday" class="muted"><Icon name="war" /> 전쟁으로 이번 라운드 거래가 종료되었습니다.</div>
      <form v-else class="trade-form" @submit.prevent="!tradeProblem && (modal = 'trade')">
        <!-- 두 팀을 좌우로: 팀 고르기 → 그 팀이 주는 것 (보유량은 칸 아래) -->
        <div class="trade-sides">
          <template v-for="(side, i) in (['from', 'to'] as const)" :key="side">
            <div v-if="i === 1" class="swap" aria-hidden="true">⇄</div>
            <section class="side-box" :class="{ picked: !!tradeForm[side] }" :style="teamStyle(tradeForm[side])">
              <p class="side-title">{{ side === 'from' ? '팀 A' : '팀 B' }}</p>
              <TeamPicker v-model="tradeForm[side]" :teams="groups" :disabled-id="side === 'from' ? tradeForm.to : tradeForm.from" />
              <p class="gives"><TeamMark v-if="tradeForm[side]" :color="team(tradeForm[side]!)?.color ?? ''" />{{ tradeForm[side] ? `${josa(team(tradeForm[side]!)?.name ?? '', '이/가')} 주는 것` : '주는 것' }}</p>
              <div class="give-grid">
                <label v-for="k in RESOURCE_KINDS" :key="k" class="give">
                  <span class="k"><Icon :name="k" /> {{ RESOURCE_LABELS[k] }}</span>
                  <input v-model.number="tradeForm[side === 'from' ? 'fromOffer' : 'toOffer'][k]" type="number" min="0" :title="`보유 ${teamRes(tradeForm[side])[k]}`" />
                  <span class="have mono">{{ tradeForm[side] ? `보유 ${teamRes(tradeForm[side])[k]}` : '' }}</span>
                </label>
              </div>
            </section>
          </template>
        </div>
        <div class="trade-foot">
          <template v-if="tradeForm.from && tradeForm.to">
            <span class="muted"><Icon name="credit" /> 수수료 1개</span>
            <div class="seg" role="group">
              <button v-for="id in [tradeForm.from, tradeForm.to]" :key="id" type="button" :aria-pressed="tradeForm.creditPayer === id" @click="tradeForm.creditPayer = id"><TeamMark :color="team(id)?.color ?? ''" />{{ team(id)?.name.replace(/ 팀$/, '') }} 부담</button>
            </div>
          </template>
          <span class="sp" />
          <span v-if="tradeProblem" class="muted">{{ tradeProblem }}</span>
          <button type="submit" :disabled="busy || !!tradeProblem">거래 처리</button>
        </div>
      </form>
    </section>

    <!-- 전쟁: 오늘 비용 · 진행 중 전쟁 결과 지정 -->
    <section v-if="round === 'trade' || warActive" class="card sec" :class="warActive ? 'war-on pick' : 'info'">
      <h3 v-if="warToday && warActive"><Icon name="war" /> 전쟁 중: {{ team(warToday.attacker)?.name }} → {{ team(warToday.defender)?.name }} <span class="muted">비용 {{ costText(warToday.cost) }}</span></h3>
      <h3 v-else><Icon name="war" /> 전쟁</h3>
      <div v-if="warToday && warActive" class="war-active">
        <p class="muted">오프라인 게임 결과를 지정하세요. 결과를 넣으면 재화가 넘어가고, 다음 단계를 누르면 리더 협의로 넘어갑니다.</p>
        <div class="row war-pick">
          <button class="team-apply" :style="teamStyle(warToday.attacker)" :disabled="busy" @click="askWar('attacker')">{{ team(warToday.attacker)?.name }} 승리</button>
          <button class="team-apply" :style="teamStyle(warToday.defender)" :disabled="busy" @click="askWar('defender')">{{ team(warToday.defender)?.name }} 승리</button>
        </div>
      </div>
      <p v-else-if="warToday">
        이번 라운드 전쟁: {{ team(warToday.attacker)?.name }} → {{ team(warToday.defender)?.name }} · <strong>{{ team(warWinner(warToday))?.name }} 승리</strong>
        <span v-if="warToday.spoils" class="muted"> · 전리품 {{ offerText(warToday.spoils) }}</span>
      </p>
      <p v-else-if="!view.war.todayAllowed" class="muted"><strong class="error">이번 라운드 전쟁 금지</strong> (리더 협의 결과)</p>
      <p v-else class="muted">선포된 전쟁 없음 · 선포 비용 {{ costText(view.war.todayCost) }}</p>
    </section>

    <!-- 리더 협의: 원조 -->
    <section v-if="round === 'council'" class="card stage sec">
      <h3><Icon name="aid" /> 대가 없는 원조 <span class="muted">라운드마다 전체 1번 · 리더 4명 중 3명 찬성</span></h3>
      <AidForm :groups="groups" />
    </section>

    <!-- 리더 협의: 마지막 라운드 필수 안건 -->
    <section v-if="lifeVoteOpen" class="card stage sec pick">
      <h3><Icon name="scroll" /> 필수 안건: 라이프 투표권</h3>
      <p class="muted">기본으로 반영합니다 (팀마다 남은 라이프 수만큼 무작위로 뽑힌 사람이 최종 투표에서 1표 더, 1인 1장). 리더 3명이 반대하면 "미반영"을 누르세요.</p>
      <div class="row decide">
        <button type="button" class="secondary" :class="{ chosen: s.lifeVoteSet && s.lifeVote }" :disabled="busy" @click="setLifeVote(true)">반영으로 확정</button>
        <button type="button" class="secondary" :class="{ chosen: s.lifeVoteSet && !s.lifeVote }" :disabled="busy" @click="setLifeVote(false)">미반영으로 확정 (반대 3표)</button>
      </div>
      <p class="muted">{{ s.lifeVoteSet ? `확정·공지됨: ${s.lifeVote ? '반영' : '미반영'}` : '아직 확정하지 않았습니다. 입력하지 않으면 반영입니다.' }}</p>
    </section>

    <!-- 리더 협의: 다음 라운드 전쟁 제재 -->
    <section v-if="round === 'council' && !isLastDay" class="card sec pick" :class="{ stage: !view.war.sanctionOff && view.war.nextAllowed == null }">
      <h3><Icon name="war" /> {{ s.day + 1 }}라운드 전쟁 제재</h3>
      <template v-if="!view.war.sanctionOff">
        <p class="muted">리더 협의(오프라인 투표) 결과를 확정하세요. 리더 3명 이상이 제재에 찬성하면 "전쟁 금지", 아니면 "허용"입니다. 전쟁 금지면 다음 라운드에는 어느 팀도 전쟁을 선포할 수 없습니다.</p>
        <!-- 협의 결과 확정 버튼 (누르면 확인 후 전체 공지). 위쪽 안건 포함/제외 선택과 헷갈리지 않게 따로 떨어진 버튼으로 -->
        <div class="row decide">
          <button type="button" class="secondary" :class="{ chosen: view.war.nextAllowed === true }" :disabled="busy" @click="setWarAllowed(true)">허용으로 확정</button>
          <button type="button" class="secondary" :class="{ chosen: view.war.nextAllowed === false }" :disabled="busy" @click="setWarAllowed(false)">전쟁 금지로 확정 (제재 3표 이상)</button>
        </div>
        <p class="muted">{{ view.war.nextAllowed == null ? '아직 확정하지 않았습니다. 둘 중 하나를 확정해야 다음 단계로 넘어갑니다.' : `확정·공지됨: ${view.war.nextAllowed ? '허용' : '전쟁 금지'}` }}</p>
      </template>
      <p v-else class="muted">이번 리더 협의에는 전쟁 제재 안건을 넣지 않았습니다 ({{ s.day + 1 }}라운드 전쟁 가능).</p>
    </section>

    <!-- 라이프 제출 -->
    <section v-if="round === 'life'" class="card stage sec">
      <h3>라이프 제출 <span v-if="s.livesDone" class="badge on">모든 팀 제출</span></h3>
      <table class="tbl">
        <tbody>
          <tr v-for="t in view.teams" :key="t.teamId">
            <td><TeamMark :color="team(t.teamId)?.color ?? ''" />{{ team(t.teamId)?.name }}</td>
            <td>
              <template v-if="t.lifeSubmission">
                <span class="badge on">제출</span> 생존 {{ t.lifeSubmission.saved.map((id) => t.lifeSubmission!.names[id] ?? nameOf(id)).join(', ') }}
                <template v-if="t.lifeSubmission.livesUsed">(라이프 {{ t.lifeSubmission.livesUsed }})</template>
                <template v-else>(라이프 0 · 1명 생존)</template>
                <span v-if="t.lifeSubmission.selfEliminated" class="badge">리더 자진 탈락</span>
                <span v-if="t.lifeSubmission.eliminated.length" class="error"> · 탈락 {{ t.lifeSubmission.eliminated.map((id) => t.lifeSubmission!.names[id] ?? nameOf(id)).join(', ') }}</span>
              </template>
              <span v-else-if="t.activeMembers === 0" class="muted">활성 팀원 없음</span>
              <span v-else-if="isLifeExempt(t.activeMembers, t.resources.life)" class="muted">제출 불필요 · 팀원 1명 · 라이프 0 (자동 생존)</span>
              <span v-else><span class="badge warn">미제출</span> <span class="muted">라이프 {{ t.resources.life }} · 팀원 {{ t.activeMembers }}명</span></span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 다음 라운드 전쟁 비용: 정해야 다음 라운드로 넘어간다 -->
    <section v-if="!isLastDay && (round === 'council' || round === 'life')" class="card sec" :class="view.war.nextCost ? 'info' : 'stage pick'">
      <h3><Icon name="war" /> {{ s.day + 1 }}라운드 전쟁 선포 비용 <span v-if="view.war.nextCost" class="badge on">저장됨</span></h3>
      <div class="row war-cost">
        <label v-for="k in WAR_COST_KINDS" :key="k" class="num"><Icon :name="k" /> {{ RESOURCE_LABELS[k] }} <input v-model.number="nextCost[k]" type="number" min="0" /></label>
        <button class="secondary small" :disabled="busy" @click="saveNextCost">저장</button>
        <span v-if="view.war.nextCost" class="muted">{{ costText(view.war.nextCost) }}</span>
        <span v-else class="blocker">정해야 다음 라운드로 넘어갑니다</span>
      </div>
    </section>

    <!-- 리더 협의에 전쟁 제재 안건 포함 여부: 리더 협의 전에 정한다. 라운드마다 "포함"으로 돌아간다 -->
    <section v-if="(round === 'leader' || round === 'production' || round === 'trade') && !isLastDay" class="card sec pick">
      <div class="row sanction-row">
        <h3><Icon name="war" /> 리더 협의에 전쟁 제재 안건 포함 여부</h3>
        <div class="seg" role="group">
          <button type="button" :aria-pressed="!view.war.sanctionOff" :disabled="busy" @click="setSanctionOff(false)">포함 (기본)</button>
          <button type="button" :aria-pressed="view.war.sanctionOff" :disabled="busy" @click="setSanctionOff(true)">안 함</button>
        </div>
      </div>
      <p class="muted">{{ view.war.sanctionOff ? '이번 리더 협의에서는 전쟁 제재를 다루지 않습니다. 다음 라운드도 전쟁 가능.' : '이번 리더 협의에서 전쟁 제재를 다룹니다. 리더 3명 이상이 찬성하면 다음 라운드 전쟁을 금지합니다.' }} 리더 협의 전까지 바꿀 수 있고, 라운드마다 "포함"으로 돌아갑니다.</p>
    </section>

    <!-- 최종장 (docs/100 N2) -->
    <section v-if="s.status === 'final' && s.final" class="card stage sec"><FinalControl :groups="groups" /></section>
    <section v-else-if="s.status === 'ended' && s.final" class="card sec"><ResultsBoard :final="s.final" :results="s.results" /></section>
  </template>

  <!-- 테러리스트 · 이주: 진행판 오른쪽 참고 칸(#admin-side)으로 보낸다 -->
  <Teleport defer to="#admin-side">
    <!-- 테러리스트 현황 (관리자만) -->
    <div v-if="(s.status === 'running' || s.status === 'final') && view.spy.spies.length" class="card late">
      <h2><Icon name="spy" /> 테러리스트 <span class="muted">관리자만 보입니다 · 시작 이후 탈락자 1명당 5천 원 (최대 5만 원)</span></h2>
      <table class="tbl">
        <tbody>
          <tr v-for="x in view.spy.spies" :key="x.userId">
            <td><strong>{{ x.name }}</strong></td>
            <td><TeamMark :color="team(x.teamId ?? 0)?.color ?? ''" />{{ x.teamId != null ? team(x.teamId)?.name : '-' }}</td>
            <td class="mono">탈락자 {{ x.eliminated }}명</td>
            <td class="mono"><strong>{{ x.alive ? won(x.reward) : '탈락 · 0원' }}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 이주 (docs/100 N3) -->
    <div v-if="s.status === 'running' && s.day >= migrationOpenFrom" class="card late">
      <h2><Icon name="migration" /> 이주 <span class="muted">{{ migrationOpenFrom }}라운드부터 · 라이프 제출 단계 제외</span></h2>
      <p v-if="!view.migrations.pending.length" class="muted" style="margin: 0">대기 중인 이주 신청 없음</p>
      <ul v-else class="migr">
        <li v-for="m in view.migrations.pending" :key="m.id">
          <div class="m1">
            <strong>{{ m.userName }}</strong>
            <span class="path"><TeamMark :color="team(m.fromTeamId)?.color ?? ''" />{{ team(m.fromTeamId)?.name.replace(/ 팀$/, '') }} → <TeamMark :color="team(m.toTeamId)?.color ?? ''" />{{ team(m.toTeamId)?.name.replace(/ 팀$/, '') }}</span>
          </div>
          <div class="m2">
            <span class="badge warn">받는 팀 리더 수락 대기</span>
            <button class="secondary small" :disabled="busy" @click="cancelMigration(m.id)">강제 취소</button>
          </div>
        </li>
      </ul>
      <details v-if="view.migrations.recent.length" style="margin-top: 6px">
        <summary class="muted">최근 처리 {{ view.migrations.recent.length }}건</summary>
        <ul class="feed">
          <li v-for="m in view.migrations.recent" :key="m.id">
            {{ m.day }}라운드 · {{ m.userName }} · {{ team(m.fromTeamId)?.name }} → {{ team(m.toTeamId)?.name }} ·
            <strong>{{ m.status === 'cancelled' ? (m.cancelReason ? MIGRATION_CANCEL_LABELS[m.cancelReason] : '취소') : MIGRATION_STATUS[m.status] }}</strong>
          </li>
        </ul>
      </details>
    </div>


  </Teleport>

    <!-- 메뉴 화면(덮개)으로 보낸다 -->
  <Teleport defer to="#admin-left">
  <!-- 게임 관리 메뉴: 게임을 되돌리거나 지우는 동작은 여기에만 둔다 -->
  <div v-show="menu === 'manage'" class="card manage">
    <h2>게임 관리</h2>
    <ul class="settings">
      <!-- 시작 후에는 게임 설정 카드가 숨으므로 여기서 테스트 모드를 끌 수 있게 (docs/101) -->
      <li v-if="s.status === 'running' || s.status === 'final' || s.status === 'ended'">
        <TabLoginToggle />
      </li>
      <li v-if="s.status === 'ready'">
        <div class="txt"><strong>설정으로 되돌리기</strong><span class="muted">참가자가 팀을 고를 수 없게 됩니다. 이미 고른 팀과 PIN 은 남습니다.</span></div>
        <button class="secondary small" :disabled="busy" @click="modal = 'revert'">되돌리기</button>
      </li>
      <li>
        <div class="txt"><strong>게임 리셋</strong><span class="muted">참가자·진행자 계정과 모든 기록·알림을 지우고 설정 단계로 돌아갑니다. 되돌릴 수 없습니다.</span></div>
        <button class="small danger" :disabled="busy" @click="clearSettings = false; modal = 'reset'">리셋</button>
      </li>
    </ul>
  </div>
  </Teleport>

    <ModalDialog
      :open="modal !== null"
      :title="modalText.title"
      :message="modalText.message"
      :confirm-label="modal === 'reset' ? '리셋' : modal === 'end' ? '최종장 시작' : modal === 'start' ? '세팅 완료' : modal === 'war' ? '결과 확정' : modal === 'trade' ? '거래 진행' : '확인'"
      cancel-label="닫기"
      :danger="modal === 'reset'"
      :busy="busy"
      @confirm="onConfirm"
      @cancel="modal = null"
    >
      <label v-if="modal === 'reset'" class="row clear-opt">
        <input v-model="clearSettings" type="checkbox" />
        게임 설정값(팀별 최대 인원·초기 재화·총 라운드·전쟁 비용)도 기본값으로 되돌리기
      </label>
    </ModalDialog>
  </template>
</template>

<style scoped>
h3 { font-size: 0.95rem; margin: 16px 0 6px; font-weight: 600; }
.ctrl { position: sticky; top: 0; z-index: 20; margin-bottom: 12px; background: var(--bg); }
/*
 * 상태판 (넓은 화면): 한 줄에 [라운드·단계 이름] [진행 순서 타임라인] [남은 시간] [다음 버튼],
 * 아래 줄에 [최근 알림] [참가자 수], 넘어가지 못하는 이유는 맨 아래 빨간 줄.
 * GamePhaseBar 의 칸들을 display: contents 로 풀어 이 격자에 직접 놓는다
 */
.ctrl-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  grid-template-areas:
    'day    steps  time acts'
    'title  steps  time acts'
    'notice notice facts facts'
    'note   note   note note';
  gap: 0 28px;
  align-items: center;
  margin-bottom: 0;
  padding: 18px 22px 16px;
  background: #111113;
  color: #fff;
  box-shadow: 0 12px 28px -16px rgba(8, 8, 8, 0.5);
}
.ctrl-head :deep(.muted) { color: #b0b4ba; }
.where, .where :deep(.phase-bar), .where :deep(.now) { display: contents; }
.where :deep(.day) { grid-area: day; align-self: end; font-size: 0.9rem; color: #b0b4ba; white-space: nowrap; }
.where :deep(.now > .muted) { grid-area: day; align-self: end; font-size: 0.9rem; }
.where :deep(.now strong), .where .label strong { grid-area: title; align-self: start; font-family: var(--font-display); font-weight: 400; font-size: 2.6rem; line-height: 1.1; letter-spacing: -0.065em; color: #fff; white-space: nowrap; }
.where .label { display: contents; }
.where .label .muted { grid-area: day; align-self: end; font-size: 0.9rem; }
.where :deep(.time) { grid-area: time; justify-self: end; margin: 0; font-size: 2.4rem; font-weight: 600; color: #fff; }
.where :deep(.time.warn) { color: #ff8a7a; }
.where :deep(.time.over) { font-size: 1rem; font-weight: 600; color: #b0b4ba; padding: 4px 12px; border-radius: 999px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25); }
/* 진행 순서: 탭 대신 점과 선으로 잇는 타임라인 */
.where :deep(.steps) { grid-area: steps; display: flex; align-items: center; width: auto; margin: 0; padding: 0; background: none; border-radius: 0; }
.where :deep(.steps li) { display: flex; flex: 1 1 0; align-items: center; gap: 8px; min-width: 0; padding: 0; background: none; box-shadow: none; border: 0; color: #6f7278; font-size: 0.92rem; font-weight: 600; white-space: nowrap; }
.where :deep(.steps li:last-child) { flex: none; }
.where :deep(.steps li::before) { content: ''; flex: none; width: 10px; height: 10px; border-radius: 50%; box-shadow: inset 0 0 0 2px #4a4d53; }
.where :deep(.steps li:not(:last-child)::after) { content: ''; flex: 1; min-width: 12px; height: 2px; margin-right: 8px; border-radius: 1px; background: #2f3136; }
.where :deep(.steps li.past) { color: #9a9da3; }
.where :deep(.steps li.past::before) { background: #9a9da3; box-shadow: none; }
.where :deep(.steps li.past::after) { background: #6f7278; }
.where :deep(.steps li.cur) { background: none; color: #fff; }
.where :deep(.steps li.cur::before) { width: 12px; height: 12px; background: #fff; box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.16); }
.acts { grid-area: acts; display: flex; gap: 8px; }
.acts button:not(.danger):not(.secondary) { background: #fff; color: var(--ink); }
.acts button:not(.danger):not(.secondary):hover { background: #e9e8e3; }
.acts button.secondary { background: none; color: #fff; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35); }
.head-notice { grid-area: notice; margin-top: 14px; }
.head-notice.notice-bar, .head-notice.notice-bar:hover { background: rgba(255, 255, 255, 0.08); color: #fff; box-shadow: none; }
.head-notice :deep(.more), .head-notice .more { color: #b0b4ba; }
.facts { grid-area: facts; justify-self: end; display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 14px 0 0; padding: 0; list-style: none; color: #b0b4ba; font-size: 0.93rem; white-space: nowrap; }
.facts strong { color: #fff; }
/* 마지막 라운드는 버튼이 둘이라 세로로 쌓는다 */
.acts.stack { flex-direction: column; }
.notes { grid-area: note; display: flex; flex-wrap: wrap; gap: 2px 16px; margin-top: 10px; }
.note { margin: 0; color: #ff9c8f; font-size: 0.93rem; font-weight: 600; }
.note.muted { color: #b0b4ba; font-weight: 500; }
.stage { box-shadow: 0 0 0 2px var(--ink); }
.stage > :first-child { margin-top: 0; }
.sec h3 { font-size: 1.13rem; font-weight: 700; }
.late { order: 3; }
.opening { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; list-style: none; margin: 0; padding: 0; }
.opening li { padding: 12px; border-radius: var(--radius); background: var(--bg-soft); color: var(--muted); font-weight: 600; text-align: center; }
.opening li.cur { background: var(--ink); color: #fff; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
.tbl th, .tbl td { text-align: left; padding: 5px 12px 5px 0; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.tbl th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
.letter { display: inline-block; min-width: 1.4em; font-weight: 600; }
.war-active { display: flex; flex-direction: column; gap: 6px; }
/* 전쟁 중이면 카드 자체를 빨간 카드로 */
.sec.war-on { background: var(--red-bg); box-shadow: 0 0 0 2px var(--red); }
.sec.war-on h3 { color: var(--red); }
.war-active p { margin: 0; }
.war-pick { gap: 10px; margin-top: 8px; }
.war-pick button { min-width: 180px; min-height: 44px; }
.war-cost { gap: 8px; align-items: center; margin-top: 6px; }
.war-cost input { width: 5em; }
.blocker { color: var(--red); font-size: 0.88rem; }
.trade { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.trade-form { display: flex; flex-direction: column; gap: 10px; }
.trade-sides { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 10px; align-items: stretch; }
.swap { align-self: center; font-size: 1.4rem; color: var(--muted); }
.side-box { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; border-radius: var(--radius); box-shadow: inset 0 0 0 1px var(--line-soft); border-top: 4px solid var(--team, var(--line)); }
.side-box > .team-picker { flex: none; }
.side-title { margin: 0; font-size: 0.8rem; font-weight: 700; color: var(--muted); }
.gives { margin: 2px 0 0; font-weight: 700; color: var(--team, var(--ink)); }
.give-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.give { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.give .k { font-size: 0.82rem; color: var(--ink-2); white-space: nowrap; }
.give input { width: 100%; min-width: 0; }
.give .have { min-height: 1.1em; font-size: 0.78rem; color: var(--muted); }
.trade-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.trade-foot .sp { flex: 1; }
@media (max-width: 1100px) {
  .trade-sides { grid-template-columns: minmax(0, 1fr); }
  .swap { justify-self: center; transform: rotate(90deg); }
}
.team-apply { background: var(--surface); color: var(--team, var(--ink)); font-weight: 700; box-shadow: inset 0 0 0 2px var(--team, var(--ink)); }
.sec h3 .muted { font-weight: 400; font-size: 0.8rem; }
.seg { display: inline-flex; border-radius: var(--radius); box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; }
.seg button { min-height: 34px; padding: 0 12px; background: var(--bg-soft); color: var(--ink); border-radius: 0; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 4px; }
.seg button + button { box-shadow: inset 1px 0 0 var(--line); }
.seg button:hover { background: #e6e4dd; }
.seg button[aria-pressed='true'] { background: var(--ink); color: #fff; font-weight: 700; }
.sec > h3:first-child, .sec > .row:first-child h3 { margin-top: 0; }
.sec.pick { order: -1; }
.leader-select { width: 240px; }
.sec.info { order: 1; }
.sec > p { margin: 4px 0 0; }
.acts-row { gap: 8px; margin-top: 8px; align-items: center; }
.decide { gap: 12px; margin-top: 10px; }
.decide button { min-width: 180px; }
.decide button.chosen { box-shadow: inset 0 0 0 2px var(--ink); font-weight: 700; }
.decide button.chosen::before { content: '✓ '; }
.decide + .muted { margin-top: 8px; }
.sanction-row { gap: 8px 14px; align-items: center; justify-content: space-between; }
.sanction-row h3 { margin: 0; }
.num { display: inline-flex; align-items: center; gap: 4px; }
.team-select.picked { border: 2px solid var(--team); color: var(--team); font-weight: 700; background: color-mix(in srgb, var(--team) 12%, var(--surface)); }
button.small { padding: 4px 10px; font-size: 0.85rem; }
.reset-done { line-height: 1.6; }
.head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.head-row h3 { margin: 0; }
.big-count { margin: 0; font-size: 1.05rem; color: var(--muted); }
.big-count strong { font-size: 2.4rem; color: var(--ink); }
.lobby { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; list-style: none; margin: 12px 0 0; padding: 0; }
.lobby li { padding: 12px 14px; border-radius: var(--radius); background: var(--bg-soft); }
.lobby li.full { background: var(--surface); box-shadow: inset 0 0 0 2px var(--ink); }
.lobby p { margin: 0; }
.lobby .t { display: flex; align-items: center; gap: 4px; font-weight: 700; }
.lobby .n { margin-top: 6px; color: var(--muted); }
.lobby .n strong { font-size: 1.9rem; color: var(--ink); }
.mini-bar { height: 6px; margin-top: 8px; border-radius: 999px; background: rgba(8, 8, 8, 0.08); overflow: hidden; }
.mini-bar span { display: block; height: 100%; border-radius: 999px; }
.lobby .s { margin-top: 6px; font-size: 0.8rem; color: var(--muted); }
.foot { margin: 10px 0 0 !important; font-size: 0.85rem; }
.cands { list-style: none; margin: 10px 0 0; padding: 0; border-top: 1px solid var(--line-soft); }
.cands li { border-bottom: 1px solid var(--line-soft); }
.cands label { display: flex; align-items: center; gap: 10px; padding: 10px 4px; cursor: pointer; }
.cands label.on .nm { color: var(--red); }
.cands .nm { font-weight: 700; min-width: 0; }
.cands .nm .muted { font-weight: 400; font-size: 0.8rem; }
.cands .tm { margin-left: auto; min-width: 7em; display: inline-flex; align-items: center; gap: 2px; font-size: 0.85rem; color: var(--ink-2); }
.spy-act { gap: 10px; margin-top: 12px; align-items: center; }
.issue-rows { list-style: none; margin: 10px 0 0; padding: 0; }
.issue-rows li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); }
.issue-rows .who { display: inline-flex; align-items: center; gap: 4px; min-width: 12em; font-weight: 600; }
.migr { list-style: none; margin: 4px 0 0; padding: 0; }
.migr li { padding: 8px 0; border-bottom: 1px solid var(--line-soft); }
.migr .m1, .migr .m2 { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; }
.migr .m2 { justify-content: space-between; margin-top: 6px; }
.migr .path { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
.settings { list-style: none; margin: 8px 0 0; padding: 0; border-top: 1px solid var(--line-soft); }
.settings li { display: flex; align-items: center; gap: 12px; padding: 12px 2px; border-bottom: 1px solid var(--line-soft); }
.settings .txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.settings .txt .muted { font-size: 0.85rem; }
.settings button { flex: none; }
.reset-done button { margin-left: 8px; }
.clear-opt { gap: 8px; align-items: flex-start; flex-wrap: nowrap; font-size: 0.92rem; cursor: pointer; }
.clear-opt input { flex: none; margin-top: 3px; }
</style>
