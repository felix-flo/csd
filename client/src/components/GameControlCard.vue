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
 * - 리더 협의 (docs/103 §11·§12): 원조는 팀 재화 카드에서, 다음 라운드 전쟁 허용/제재는 여기서 입력.
 *   전쟁은 기본 허용, 리더 3명 이상이 제재 찬성 시 금지. 협의 전에 "전쟁 제재 금지" 를 켜면 안건에서 빠진다 (2026-11-03).
 */
import { computed, reactive, ref, watch } from 'vue'
import type { AdminUser, GroupInfo } from '../../../shared/types'
import {
  FINAL_STEP_LABELS, MIGRATION_CANCEL_LABELS, PHASE_LABELS, phaseLabel, phasesOf, RESOURCE_KINDS, RESOURCE_LABELS, WAR_COST_KINDS, warWinner, emptyResources, isLifeExempt, josa, teamLetter,
  type AdminGameView, type Phase, type Resources, type WarCost, type WarResult,
  OPENING_LABELS, OPENING_STEPS,
} from '../../../shared/game'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
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
  if (s.value?.phase !== 'life') return '마지막 라운드 라이프 제출 단계에서 모든 팀이 제출하면 종료할 수 있습니다'
  return `라이프 미제출: ${lifePending.value.join(', ')} — 모든 팀이 제출하면 종료할 수 있습니다`
})
// ---- 전쟁 (docs/99) ----
const warToday = computed(() => view.value?.war.today ?? null)
/** 진행 중 전쟁이 있으면 단계 넘기기·게임 종료 불가 (서버도 409 war_active) */
const warActive = computed(() => warToday.value?.status === 'declared')
const warBlocker = computed(() => (warActive.value ? '전쟁 결과를 먼저 정하세요' : ''))
/** 다음 라운드 전쟁 허용/제재 (리더 협의 단계, docs/103 §12) */
function setWarAllowed(allowed: boolean) {
  return run(`${(s.value?.day ?? 0) + 1}라운드 전쟁 ${allowed ? '허용' : '제재'}`, () => api.post('/api/admin/war/allow', { allowed }))
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

// ---- 이주 (docs/100 N3) ----
const migrationOpenFrom = computed(() => view.value?.settings.migrationStartDay ?? 4)
const MIGRATION_STATUS: Record<string, string> = { accepted: '이주 완료', rejected: '거절' }
function cancelMigration(id: number) {
  return run('이주 신청 취소', () => api.post(`/api/admin/migration/${id}/cancel`))
}

// ---- 마지막 라운드 필수 안건: 남은 라이프를 최종 투표권으로 (docs/100 N2) ----
const lifeVoteOpen = computed(() => s.value?.status === 'running' && isLastDay.value && s.value.phase === 'council')
function setLifeVote(passed: boolean) {
  return run(`라이프 투표권 ${passed ? '반영' : '미반영'}`, () => api.post('/api/admin/game/life-vote', { passed }))
}

/** 다음 단계/다음 날 버튼을 막는 이유 */
const advanceBlocker = computed(() => {
  if (warBlocker.value) return warBlocker.value
  if (s.value?.phase === 'leader' && !s.value.leadersDone) return s.value.day > 1 ? '모든 팀의 재신임 결과를 입력해야 다음 단계로 넘어갈 수 있습니다' : '모든 팀의 리더를 지정해야 다음 단계로 넘어갈 수 있습니다'
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
  if (s.value.status === 'ready') return [spyBlocker.value, view.value.settings.warCost ? '' : '"게임 설정" 메뉴에서 1라운드 전쟁 선포 비용을 저장하세요'].filter(Boolean).join(' · ')
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
      const warn = st.livesDone ? '' : '\n아직 라이프를 제출하지 않은 팀이 있습니다. 미제출 팀은 라이프 소모·탈락 없이 넘어갑니다.'
      // 마지막 라운드로 넘어갈 때: 발행 허용 단계를 한 번 더 보여 준다 (넘어가면 바꿀 수 없다)
      const last = st.day + 1 >= (st.totalDays ?? 0)
        ? `\n\n${st.day + 1}라운드는 마지막 라운드입니다. 리더 협의와 라이프 제출 사이에 마지막 발행 단계가 들어갑니다.`
        : ''
      return { title: last ? `마지막 라운드(${st.day + 1}라운드)로 넘길까요?` : `${st.day + 1}라운드로 넘길까요?`, message: `이번 라운드가 끝나고 ${st.day + 1}라운드 리더 선출이 시작됩니다.${warn}${last}` }
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
      const tab = view.value?.settings.tabLogin ? '\n\n테스트 모드(탭 로그인)가 켜져 있습니다. 참가자가 새 탭을 열 때마다 다시 로그인해야 합니다. 실제 진행이면 "게임 설정"에서 끄세요.' : ''
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
        message: `${a} → ${d}\n${lose}의 모든 재화(보석·골드·라이프·크레딧) 절반(내림)을 ${josa(win, '이/가')} 가져갑니다.\n결과는 전체에 알리고, 오간 수량은 두 팀에게만 보입니다. 되돌릴 수 없습니다.`,
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
  <!-- 어느 메뉴에서든 항상 보이는 부분: 지금 단계 + 다음 동작 + 넘어가지 못하는 이유 -->
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
          <button v-if="isLastDay" class="lg danger" :disabled="busy || !canEnd" @click="modal = 'end'">게임 종료 (최종장 시작)</button>
        </template>
      </div>
      <NoticeBar class="head-notice" @open="$emit('notices')" />
      <ul v-if="facts.length" class="facts">
        <li v-for="f in facts" :key="f.label">{{ f.label }} <strong class="mono">{{ f.value }}</strong></li>
      </ul>
      <p v-if="headNote" class="note">{{ headNote }}</p>
      <p v-if="status" class="note muted">{{ status }}</p>
    </div>
  </div>

  <div v-if="resetDone" class="card reset-done">
    <strong>리셋 완료</strong> · 참가자 {{ resetDone.members }}명 · 진행자 {{ resetDone.staff }}명 · 알림 {{ resetDone.events }}건 삭제, 테스트 계정은 같은 PIN 으로 다시 생성.
    <br />
    <template v-if="resetDone.clearedSettings">게임 설정값(최대 인원·초기 재화 등)을 기본값으로 되돌렸습니다 (발행 한도도 기본값 250·200).</template>
    <template v-else>게임 설정값(최대 인원·초기 재화)은 이전 값을 남겼습니다. "게임 설정" 메뉴에서 수정하세요.</template>
    <button class="secondary small" type="button" @click="resetDone = null">닫기</button>
  </div>

  <!-- 입장 현황 -->
  <div v-if="s.status === 'ready'" class="card">
      <h2>팀 입장 현황</h2>
      <table class="tbl">
        <thead><tr><th>팀</th><th>입장 / 최대</th></tr></thead>
        <tbody>
          <tr v-for="(g, i) in groups" :key="g.id">
            <td><span class="mono letter">{{ teamLetter(i) }}</span> <TeamMark :color="g.color" />{{ g.name }}</td>
            <td class="mono">{{ lobbyOf(g.id)?.count ?? 0 }} / {{ lobbyOf(g.id)?.capacity ?? 0 }}<span v-if="membersOf(g.id).some((u) => u.isTest)" class="muted"> + 테스트 {{ membersOf(g.id).filter((u) => u.isTest).length }}</span></td>
          </tr>
        </tbody>
      </table>
      <p class="muted" style="margin: 8px 0 0">
        팀을 고르지 않은 참가자 {{ view.prep.unassigned }}명<template v-if="view.prep.unassigned"> · 시작하면 비활성 처리됩니다</template>.
        리더는 시작 후 1라운드 리더 선출 단계에서 지정합니다.
        팀 이동은 "계정 관리" 메뉴에서 할 수 있습니다.
      </p>
  </div>

  <!-- 운명의 카드 (docs/100 N4) -->
  <div v-if="s.status === 'ready'" class="card">
      <h2><Icon name="devil" /> 운명의 카드 · 테러리스트 지정</h2>
      <p class="muted" style="margin: 0 0 6px">
        팀을 고른 참가자는 천사/악마 중 하나를 고릅니다 (악마 = 테러리스트 후보).
        <Icon name="angel" /> 천사 <strong>{{ view.spy.counts.sun }}</strong> · <Icon name="devil" /> 악마 <strong>{{ view.spy.counts.moon }}</strong> · 미선택 <strong>{{ view.spy.counts.none }}</strong>
      </p>
      <p v-if="!view.spy.candidates.length" class="muted" style="margin: 0">아직 악마를 고른 후보가 없습니다. 후보가 없으면 테러리스트 없이 시작합니다.</p>
      <template v-else>
        <table class="tbl">
          <thead><tr><th>지정</th><th>팀</th><th>후보</th></tr></thead>
          <tbody>
            <tr v-for="c in view.spy.candidates" :key="c.userId">
              <td><input v-model="spyPick" type="checkbox" :value="c.userId" :disabled="busy" /></td>
              <td><span class="mono letter">{{ letterOfTeam(c.teamId) }}</span> <TeamMark :color="team(c.teamId)?.color ?? ''" />{{ team(c.teamId)?.name }}</td>
              <td>{{ c.name }}<span v-if="c.isTest" class="muted"> (테스트)</span></td>
            </tr>
          </tbody>
        </table>
        <div class="row" style="margin-top: 8px">
          <button class="small" :disabled="busy || !spyDirty" @click="saveSpies">테러리스트 지정 저장 ({{ spyPick.length }}명)</button>
          <span v-if="view.spy.selected.length" class="muted">저장됨: {{ view.spy.selected.map(nameOf).join(', ') }}</span>
          <span v-else class="blocker">아직 지정하지 않음</span>
        </div>
      </template>
  </div>

  <!-- 현재 단계: 지금 단계에서 할 일만 -->
  <div v-if="s.status !== 'setup' && s.status !== 'ready'" class="card stage">
    <ol v-if="s.opening" class="opening">
      <li v-for="o in OPENING_STEPS" :key="o" :class="{ cur: o === s.opening }">{{ OPENING_LABELS[o] }}</li>
    </ol>

    <!-- 리더 선출 -->
    <template v-if="round === 'leader'">
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
                <select v-model="leaderPick[t.teamId]">
                  <option :value="undefined" disabled>{{ (s.day > 1 || t.election.status === 'done') && leaderOf(t.teamId) ? `현재: ${leaderOf(t.teamId)?.name}` : '리더 선택' }}</option>
                  <option v-for="u in membersOf(t.teamId)" :key="u.id" :value="u.id">{{ u.name }}{{ s.day > 1 && u.isLeader ? ' (현재 리더)' : '' }}</option>
                </select>
                <button class="small" :disabled="busy || (!leaderPick[t.teamId] && (s.day === 1 || !leaderOf(t.teamId))) || membersOf(t.teamId).length === 1" :title="leaderPick[t.teamId] ? '' : '고르지 않으면 현재 리더를 그대로 확정합니다'" @click="designate(t.teamId)">{{ s.day === 1 ? '리더 지정' : leaderPick[t.teamId] ? '교체' : '재신임' }}</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- 생산 -->
    <p v-if="round === 'production'" class="muted">
      오프라인 미니게임 결과를 아래 "팀 재화" 카드에서 "생산" 으로 입력하세요. 팀 선택 칸이 고른 팀의 색으로 바뀌니 팀을 확인하고 적용하세요.
    </p>

    <p v-if="round === 'last_issue'" class="muted">
      화이트와 골드 리더가 휴대폰에서 마지막 발행을 합니다. 발행량은 최종장 결과 전까지 공개되지 않습니다.
    </p>

    <!-- 거래 -->
    <template v-if="round === 'trade'">
      <h3><Icon name="aid" /> 거래 <span class="muted">입력하면 바로 체결됩니다</span></h3>
      <div v-if="warToday" class="muted"><Icon name="war" /> 전쟁으로 이번 라운드 거래가 종료되었습니다.</div>
      <form v-else class="trade-form" @submit.prevent="!tradeProblem && (modal = 'trade')">
        <div class="row">
          <TeamPicker v-model="tradeForm.from" :teams="groups" :disabled-id="tradeForm.to" />
          ↔
          <TeamPicker v-model="tradeForm.to" :teams="groups" :disabled-id="tradeForm.from" />
          <span class="muted"><Icon name="credit" /> 크레딧 1개 부담:</span>
          <label v-for="id in [tradeForm.from, tradeForm.to]" :key="id ?? 0" class="row" style="gap: 4px">
            <input v-model="tradeForm.creditPayer" type="radio" :value="id" :disabled="!id" /> {{ id ? team(id)?.name : '-' }}
          </label>
        </div>
        <div v-for="side in (['from', 'to'] as const)" :key="side" class="row offer-row" :style="teamStyle(tradeForm[side])">
          <span class="who"><TeamMark :color="team(tradeForm[side] ?? 0)?.color ?? ''" />{{ tradeForm[side] ? josa(team(tradeForm[side]!)?.name ?? '', '이/가') : (side === 'from' ? '팀 A가' : '팀 B가') }} 줌</span>
          <label v-for="k in RESOURCE_KINDS" :key="k" class="row" style="gap: 4px">
            {{ RESOURCE_LABELS[k] }} <input v-model.number="tradeForm[side === 'from' ? 'fromOffer' : 'toOffer'][k]" type="number" min="0" style="width: 4.5em" :title="`보유 ${teamRes(tradeForm[side])[k]}`" />
          </label>
          <span class="muted">보유: {{ offerText(teamRes(tradeForm[side])) }}</span>
        </div>
        <div class="row">
          <button type="submit" :disabled="busy || !!tradeProblem">거래 처리</button>
          <span v-if="tradeProblem" class="muted">{{ tradeProblem }}</span>
        </div>
      </form>
    </template>

    <!-- 전쟁: 오늘 비용·진행 중 전쟁 결과 지정·다음 날 비용 -->
    <template v-if="round === 'trade' || warActive">
      <h3><Icon name="war" /> 전쟁</h3>
      <p class="muted" style="margin-top: 0">
        이번 라운드({{ s.day }}라운드)
        <template v-if="!view.war.todayAllowed"><strong class="error">전쟁 금지</strong> (리더 협의 결과 · 선포 불가)</template>
        <template v-else>선포 비용: <strong>{{ costText(view.war.todayCost) }}</strong> · 거래 단계에서 리더가 선포하면 즉시 시작 (라운드당 1회, 먼저 선포한 팀만). 낸 비용은 소멸합니다.</template>
      </p>
      <div v-if="warToday && warActive" class="war-active">
        <div><strong><Icon name="war" /> 전쟁 중: {{ team(warToday.attacker)?.name }} → {{ team(warToday.defender)?.name }}</strong> <span class="muted">(비용 {{ costText(warToday.cost) }})</span></div>
        <div class="muted">오프라인 게임 결과를 지정하세요. 결과를 넣으면 재화가 넘어가고, 다음 단계를 누르면 리더 협의로 넘어갑니다.</div>
        <div class="row" style="margin-top: 6px">
          <button class="danger" :disabled="busy" @click="askWar('attacker')">{{ team(warToday.attacker)?.name }} 승리</button>
          <button class="danger" :disabled="busy" @click="askWar('defender')">{{ team(warToday.defender)?.name }} 승리</button>
        </div>
      </div>
      <p v-else-if="warToday">
        이번 라운드 전쟁: {{ team(warToday.attacker)?.name }} → {{ team(warToday.defender)?.name }} · <strong>{{ team(warWinner(warToday))?.name }} 승리</strong>
        <span v-if="warToday.spoils" class="muted"> · 전리품 {{ offerText(warToday.spoils) }}</span>
      </p>
      <p v-else class="muted">이번 라운드에 선포된 전쟁 없음</p>
    </template>

    <!-- 다음 라운드 전쟁 비용: 정해야 다음 라운드로 넘어간다 -->
    <div v-if="!isLastDay && (round === 'council' || round === 'life')" class="row war-cost">
      <span>{{ s.day + 1 }}라운드 선포 비용</span>
      <label v-for="k in WAR_COST_KINDS" :key="k">{{ RESOURCE_LABELS[k] }} <input v-model.number="nextCost[k]" type="number" min="0" /></label>
      <button class="secondary small" :disabled="busy" @click="saveNextCost">저장</button>
      <span v-if="view.war.nextCost" class="muted">저장됨: {{ costText(view.war.nextCost) }}</span>
      <span v-else class="blocker">아직 정하지 않음 — 정해야 다음 라운드로 넘어갑니다</span>
    </div>

    <!-- 전쟁 제재 금지 on/off: 리더 협의 단계 전에 정한다. 켜면 협의 안건에서 전쟁 제재가 빠진다 -->
    <div v-if="round && !isLastDay" class="row war-cost">
      <span><Icon name="war" /> 전쟁 제재 금지</span>
      <button class="small" :class="{ secondary: !view.war.sanctionOff }" :disabled="busy || round === 'council'" @click="setSanctionOff(true)">ON · 안건 제외</button>
      <button class="small" :class="{ secondary: view.war.sanctionOff }" :disabled="busy || round === 'council'" @click="setSanctionOff(false)">OFF · 안건 포함</button>
      <span class="muted">
        <template v-if="round === 'council'">리더 협의 중에는 바꿀 수 없습니다 · </template>
        {{ view.war.sanctionOff ? '리더 협의 안건에 전쟁 제재가 없습니다 (전쟁은 항상 가능)' : '리더 3명 이상이 제재에 찬성하면 다음 라운드 전쟁 금지를 걸 수 있습니다' }}
      </span>
    </div>

    <!-- 리더간 협의 -->
    <template v-if="round === 'council'">
      <h3><Icon name="council" /> 리더 협의</h3>
      <p class="muted" style="margin: 0">
        <Icon name="aid" /> 대가 없는 원조는 아래 "팀 재화" 카드의 원조 입력으로 처리합니다 (라운드마다 전체 1번{{ view.aidsToday.length ? ' · 이번 라운드 처리됨' : '' }}. 리더 4명 중 3명 찬성).
      </p>
      <div v-if="!isLastDay && !view.war.sanctionOff" class="life-vote" style="margin-top: 8px">
        <div><strong><Icon name="war" /> {{ s.day + 1 }}라운드 전쟁 제재</strong></div>
        <div class="muted">기본은 허용입니다. 리더 3명 이상이 제재에 찬성하면(오프라인 투표) "전쟁 금지"를 누르세요. 다음 라운드에는 어느 팀도 전쟁을 선포할 수 없습니다.</div>
        <div class="row" style="margin-top: 6px">
          <button :class="{ secondary: view.war.nextAllowed === false }" :disabled="busy" @click="setWarAllowed(true)">허용 (기본)</button>
          <button :class="{ secondary: view.war.nextAllowed !== false }" :disabled="busy" @click="setWarAllowed(false)">제재 3표 이상 · 전쟁 금지</button>
          <span class="muted">지금: <strong>{{ view.war.nextAllowed === false ? '전쟁 금지' : '허용' }}</strong><template v-if="view.war.nextAllowed != null"> (전체 공지됨)</template></span>
        </div>
      </div>
      <p v-else-if="!isLastDay" class="muted" style="margin: 6px 0 0"><Icon name="war" /> 전쟁 제재 금지가 켜져 있어 이번 협의에는 전쟁 제재 안건이 없습니다 ({{ s.day + 1 }}라운드 전쟁 가능).</p>
    </template>
    <div v-if="lifeVoteOpen" class="life-vote">
      <div><strong><Icon name="scroll" /> 필수 안건: 라이프 투표권</strong></div>
      <div class="muted">기본으로 반영합니다 (팀마다 남은 라이프 수만큼 무작위로 뽑힌 사람이 최종 투표에서 1표 더, 1인 1장). 리더 3명이 반대하면 "미반영"을 누르세요.</div>
      <div class="row" style="margin-top: 6px">
        <button :class="{ secondary: !s.lifeVote }" :disabled="busy" @click="setLifeVote(true)">반영 (기본)</button>
        <button :class="{ secondary: s.lifeVote }" :disabled="busy" @click="setLifeVote(false)">반대 3표 · 미반영</button>
        <span class="muted">지금: <strong>{{ s.lifeVote ? '반영' : '미반영' }}</strong></span>
      </div>
    </div>

    <!-- 라이프 제출 -->
    <template v-if="round === 'life'">
      <h3>라이프 제출 <span v-if="s.livesDone" class="badge on">모든 팀 제출</span></h3>
      <table class="tbl">
        <tbody>
          <tr v-for="t in view.teams" :key="t.teamId">
            <td><TeamMark :color="team(t.teamId)?.color ?? ''" />{{ team(t.teamId)?.name }}</td>
            <td>
              <template v-if="t.lifeSubmission">
                제출 · 생존 {{ t.lifeSubmission.saved.map((id) => t.lifeSubmission!.names[id] ?? nameOf(id)).join(', ') }}
                <template v-if="t.lifeSubmission.livesUsed">(라이프 {{ t.lifeSubmission.livesUsed }})</template>
                <template v-else>(라이프 0 · 1명 생존)</template>
                <span v-if="t.lifeSubmission.selfEliminated" class="badge">리더 자진 탈락</span>
                <span v-if="t.lifeSubmission.eliminated.length" class="error"> · 탈락 {{ t.lifeSubmission.eliminated.map((id) => t.lifeSubmission!.names[id] ?? nameOf(id)).join(', ') }}</span>
              </template>
              <span v-else-if="t.activeMembers === 0" class="muted">활성 팀원 없음</span>
              <span v-else-if="isLifeExempt(t.activeMembers, t.resources.life)" class="muted">제출 불필요 · 팀원 1명 · 라이프 0 (자동 생존)</span>
              <span v-else class="muted">미제출 (라이프 {{ t.resources.life }} · 팀원 {{ t.activeMembers }}명)</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- 최종장 (docs/100 N2) -->
    <FinalControl v-if="s.status === 'final' && s.final" :groups="groups" />
    <ResultsBoard v-else-if="s.status === 'ended' && s.final" :final="s.final" :results="s.results" />

  </div>

  <!-- 테러리스트 · 이주 -->
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
      <table v-else class="tbl">
        <tbody>
          <tr v-for="m in view.migrations.pending" :key="m.id">
            <td><strong>{{ m.userName }}</strong></td>
            <td><TeamMark :color="team(m.fromTeamId)?.color ?? ''" />{{ team(m.fromTeamId)?.name }} → <TeamMark :color="team(m.toTeamId)?.color ?? ''" />{{ team(m.toTeamId)?.name }}</td>
            <td class="muted">받는 팀 리더 수락 대기</td>
            <td><button class="secondary small" :disabled="busy" @click="cancelMigration(m.id)">강제 취소</button></td>
          </tr>
        </tbody>
      </table>
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


    <!-- 왼쪽 메뉴 화면으로 보낸다 -->
  <Teleport defer to="#admin-left">
  <!-- 게임 관리 메뉴: 게임을 되돌리거나 지우는 동작은 여기에만 둔다 -->
  <div v-show="menu === 'manage'" class="card">
    <h2>게임 관리</h2>
    <!-- 시작 후에는 게임 설정 카드가 숨으므로 여기서 테스트 모드를 끌 수 있게 (docs/101) -->
    <div v-if="s.status === 'running' || s.status === 'final' || s.status === 'ended'" class="row" style="margin-top: 8px">
      <TabLoginToggle />
    </div>
    <div class="row" style="margin-top: 12px">
      <button v-if="s.status === 'ready'" class="secondary" :disabled="busy" @click="modal = 'revert'">설정으로 되돌리기</button>
      <button class="secondary" :disabled="busy" @click="clearSettings = false; modal = 'reset'">게임 리셋</button>
    </div>
  </div>
  </Teleport>

    <ModalDialog
      :open="modal !== null"
      :title="modalText.title"
      :message="modalText.message"
      :confirm-label="modal === 'reset' ? '리셋' : modal === 'end' ? '최종장 시작' : modal === 'start' ? '세팅 완료' : modal === 'war' ? '결과 확정' : modal === 'trade' ? '거래 진행' : '확인'"
      cancel-label="닫기"
      :danger="modal === 'reset' || modal === 'end' || modal === 'war'"
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
.ctrl-head { display: grid; grid-template-columns: 1fr auto; gap: 12px 16px; align-items: center; margin-bottom: 0; padding: 18px 20px; background: #111113; color: #fff; box-shadow: 0 12px 28px -16px rgba(8, 8, 8, 0.5); }
.ctrl-head :deep(.muted) { color: #b0b4ba; }
.where :deep(.now strong) { font-family: var(--font-display); font-weight: 400; font-size: 2.4rem; line-height: 1.12; letter-spacing: -0.065em; color: #fff; }
.where :deep(.day) { flex-basis: 100%; color: #b0b4ba; }
.where :deep(.time) { font-size: 2rem; color: #fff; }
.where :deep(.time.warn) { color: #ff8a7a; }
.where :deep(.steps) { background: rgba(255, 255, 255, 0.1); }
.where :deep(.steps li), .where :deep(.steps li.past) { color: #8d9096; }
.where :deep(.steps li.cur) { background: #fff; color: var(--ink); box-shadow: none; }
.acts button:not(.danger):not(.secondary) { background: #fff; color: var(--ink); }
.acts button:not(.danger):not(.secondary):hover { background: #e9e8e3; }
.acts button.secondary { background: none; color: #fff; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35); }
.head-notice.notice-bar, .head-notice.notice-bar:hover { background: rgba(255, 255, 255, 0.08); color: #fff; box-shadow: none; }
.head-notice :deep(.more), .head-notice .more { color: #b0b4ba; }
.facts { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 0; padding: 8px 0 0; list-style: none; border-top: 1px solid rgba(255, 255, 255, 0.14); color: #b0b4ba; font-size: 0.93rem; }
.facts strong { color: #fff; }
.where { min-width: 0; }
.where .label { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin: 0; }
.where .label strong { color: #fff; font-family: var(--font-display); font-weight: 400; font-size: 2.4rem; line-height: 1.12; letter-spacing: -0.065em; }
.where :deep(.phase-bar) { padding: 0; margin: 0; background: none; box-shadow: none; }
.where :deep(.now) { gap: 2px 10px; padding-bottom: 0; }
.where :deep(.steps) { margin-top: 8px; }
.head-notice { grid-column: 1 / -1; }
.acts { display: flex; gap: 8px; }
/* 마지막 라운드는 버튼이 둘이라 세로로 쌓아 왼쪽 단계 표시 자리를 지킨다 */
.acts.stack { flex-direction: column; }
.note { grid-column: 1 / -1; margin: 0; color: #ff9c8f; font-size: 0.93rem; font-weight: 600; }
.note.muted { color: #b0b4ba; font-weight: 500; }
.stage { box-shadow: 0 0 0 2px var(--ink); }
.stage > :first-child { margin-top: 0; }
.stage h3 { font-size: 1.13rem; font-weight: 700; }
.late { order: 2; }
.opening { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; list-style: none; margin: 0; padding: 0; }
.opening li { padding: 12px; border-radius: var(--radius); background: var(--bg-soft); color: var(--muted); font-weight: 600; text-align: center; }
.opening li.cur { background: var(--ink); color: #fff; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
.tbl th, .tbl td { text-align: left; padding: 5px 12px 5px 0; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
.tbl th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
.letter { display: inline-block; min-width: 1.4em; font-weight: 600; }
.life-vote { margin-top: 8px; border: 1px solid var(--line); border-left: 4px solid var(--blue); border-radius: var(--radius); background: var(--bg-soft); padding: 10px 12px; }
.war-active { border: 2px solid var(--red); border-left-width: 6px; border-radius: var(--radius); background: var(--red-bg); padding: 10px 12px; }
.war-active strong { color: var(--red); }
.war-cost { gap: 8px; align-items: center; margin-top: 6px; }
.war-cost input { width: 5em; padding: 3px 6px; }
.blocker { color: var(--red); font-size: 0.88rem; }
.trade { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.trade-form { display: flex; flex-direction: column; gap: 8px; }
.trade-form input[type="number"] { padding: 3px 6px; }
.offer-row { padding: 6px 10px; border: 1px solid var(--line-soft); border-left: 4px solid var(--team, var(--line)); border-radius: var(--radius); }
.offer-row .who { font-weight: 600; min-width: 9em; color: var(--team, var(--ink)); }
.team-select.picked { border: 2px solid var(--team); color: var(--team); font-weight: 700; background: color-mix(in srgb, var(--team) 12%, var(--surface)); }
button.small { padding: 4px 10px; font-size: 0.85rem; }
.reset-done { line-height: 1.6; }
.reset-done button { margin-left: 8px; }
.clear-opt { gap: 8px; align-items: flex-start; flex-wrap: nowrap; font-size: 0.92rem; cursor: pointer; }
.clear-opt input { flex: none; margin-top: 3px; }
</style>
