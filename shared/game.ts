/**
 * 게임 진행 정의 (서버/클라이언트 공용). 설계·결정 경위: docs/95.게임진행_설계.md
 * - 게임 상태: setup(설정) → ready(준비: 참가자 입장·팀 선택) → running(진행, day/phase) → ended(종료, 등수 발표)
 * - 라운드 흐름: 리더 선출 → 생산게임 → 거래 → 리더 협의 → 라이프 제출. 단계 전환은 관리자 버튼으로만.
 * - 용어: 화면·알림은 "N라운드" (코드·DB·API 의 day 는 그대로. docs/100 §5)
 */

export const RESOURCE_KINDS = ['gem', 'gold', 'life', 'credit'] as const
export type ResourceKind = (typeof RESOURCE_KINDS)[number]
export type Resources = Record<ResourceKind, number>

export const RESOURCE_LABELS: Record<ResourceKind, string> = { gem: '보석', gold: '골드', life: '라이프', credit: '크레딧' }

export function emptyResources(): Resources {
  return { gem: 0, gold: 0, life: 0, credit: 0 }
}

export const PHASES = ['leader', 'production', 'trade', 'council', 'life'] as const
export type Phase = (typeof PHASES)[number]

export const PHASE_LABELS: Record<Phase, string> = {
  leader: '리더 선출',
  production: '생산게임',
  trade: '거래',
  council: '리더 협의',
  life: '라이프 제출',
}

export type GameStatus = 'setup' | 'ready' | 'running' | 'ended'

/** 시작 전(설정·준비)에는 참가자가 게임 화면을 보지 못하고, 팀은 실제 이름 대신 A, B, C… 로 표시한다 */
export function isBeforeStart(status: GameStatus | null | undefined): boolean {
  return status === 'setup' || status === 'ready'
}

/** 팀 순서(0부터)로 A, B, C … Z, AA, AB … */
export function teamLetter(index: number): string {
  let n = index
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

/** 준비 상태의 팀 선택 현황 (테스트 계정 제외) */
export interface LobbyTeam {
  teamId: number
  /** A, B, C … (팀 순서) */
  label: string
  count: number
  capacity: number
}

/** 프레젠테이션 팀 현황 (게임 시작 후). PIN·계정 id 는 담지 않는다 */
export interface RosterTeam {
  teamId: number
  name: string
  color: string
  /** 리더 먼저, 그다음 id 순 */
  members: { name: string; isLeader: boolean; eliminated: boolean }[]
}

/** 모든 역할에 공개되는 게임 상태 */
export interface GameState {
  status: GameStatus
  /** 총 일수. 설정 전(또는 리셋 직후)은 null */
  totalDays: number | null
  /** 현재 일차 (1부터). setup 이면 0 */
  day: number
  phase: Phase | null
  /** 모든 팀 리더 선출 완료 (현재 일차) */
  leadersDone: boolean
  /** 모든 팀 라이프 제출 완료 (현재 일차) */
  livesDone: boolean
  /** 모든 팀 초기 재화 합계 (프레젠테이션 공개용. 게임 중 변동은 공개하지 않는다) */
  initialTotals: Resources
  /** 발표된 등수 (종료 후 관리자가 발표하면) */
  results: GameResults | null
  /** 팀 선택 현황 (준비 상태에서만) */
  lobby: LobbyTeam[] | null
  /**
   * 게임 제목. 게임 시작 후에만 서버가 채운다 (시작 전 null → 프레젠테이션은 "스위칭데이").
   * 화면 코드에 넣으면 JS 파일로 미리 보이므로 서버에만 둔다 (server/src/db/game.ts GAME_TITLE)
   */
  title: string | null
  /** 전쟁 (진행 중일 때만 의미 있음). 모든 화면 상단 "⚔️ 전쟁 중" 띠, 거래 금지 표시에 쓴다 */
  war: PublicWarState
  /** 현황판 공개: 마지막 라운드 전까지 수락된 골드 발행 합계 (docs/100 D5). 시작 전은 null. 마지막 라운드 발행은 최종장 때 공개 */
  goldIssued: number | null
}

// ---- 전쟁 (docs/99.전쟁.md) ----

/** 선포 비용으로 낼 수 있는 재화 (보석·골드·크레딧). 일차마다 관리자가 정한다 */
export const WAR_COST_KINDS = ['gem', 'gold', 'credit'] as const
export type WarCost = Record<(typeof WAR_COST_KINDS)[number], number>
/** pending = 관리자 승인 대기, rejected = 거절 (docs/99 §8). declared 부터가 "전쟁 중" */
export type WarStatus = 'pending' | 'rejected' | 'declared' | 'attacker_won' | 'defender_won' | 'draw' | 'cancelled'
/** 관리자 결과 지정: 공격팀 승 / 방어팀 승 / 무승부 / 전쟁 취소 */
export type WarResult = 'attacker' | 'defender' | 'draw' | 'cancel'

export const WAR_STATUS_LABELS: Record<WarStatus, string> = {
  pending: '승인 대기',
  rejected: '거절',
  declared: '전쟁 중',
  attacker_won: '공격팀 승리',
  defender_won: '방어팀 승리',
  draw: '무승부',
  cancelled: '취소',
}

/** 모든 역할 공개 */
export interface PublicWarState {
  /** 진행 중 전쟁 (승인~결과). 이 동안 모든 팀 거래 금지. 승인 대기(pending)는 공개하지 않는다 */
  active: { id: number; attacker: number; defender: number } | null
  /** 오늘 이미 선포됐는지 (하루 게임 전체 1회) */
  usedToday: boolean
  /** 오늘 선포 비용 (게임 진행 중에만) */
  cost: WarCost | null
  /** 오늘 전쟁 기록 (현황판 공개용, docs/100 D5). 전리품은 넣지 않는다 */
  today: { attacker: number; defender: number; status: WarStatus } | null
}

/** 관리자용 전쟁 기록. spoils 는 승리팀이 빼앗은 재화 (관리자·승리팀만 안다) */
export interface WarView {
  id: number
  day: number
  attacker: number
  defender: number
  status: WarStatus
  cost: WarCost
  spoils: Resources | null
  /** 거절 사유 (rejected 일 때, 선택) */
  rejectReason: string | null
  createdAt: string
  decidedAt: string | null
}

/** 패배팀 재화의 절반(내림)을 빼앗는다 */
export function warSpoils(loser: Resources): Resources {
  const out = emptyResources()
  for (const k of RESOURCE_KINDS) out[k] = Math.floor(loser[k] / 2)
  return out
}

/** 게임 설정 (관리자). setup·ready 상태에서 수정 */
export interface GameSettings {
  totalDays: number | null
  /** teamId → 최대 인원 (테스트 계정 제외). 초기셋팅완료 때 합계만큼 팀 없는 PIN 을 만든다 */
  capacity: Record<number, number>
  /** 팀별 테스트 계정(시드 리더·팀원) 포함 여부. 미포함이면 비활성 처리돼 게임에서 빠진다 */
  includeTest: boolean
  /** 라이프 매장량 초기값. 생산 활동으로 지급하는 라이프는 남은 매장량 안에서만 가능 */
  lifeReserve: number
  /** teamId → 초기 재화 */
  initial: Record<number, Resources>
  /** 일차당 발행 한도 (보석: 이월 없음, 골드: 안 쓴 만큼 이월) */
  issueLimit: IssueLimits
  /** 1일차 전쟁 선포 비용 (설정 전이면 null — 시작 조건) */
  warCost: WarCost | null
  /** 마지막 라운드에 발행을 허용할 단계 (docs/100 D4). 마지막 라운드가 시작되면 고정 */
  lastIssuePhases: Phase[]
  /** 테스트 모드(탭 로그인, docs/101). 켜면 리프레시 쿠키 없이 탭마다 로그인. 언제든 전환 */
  tabLogin: boolean
}

export type ScoreMode = 'gem' | 'gold' | 'ratio'

export interface ScoreRule {
  mode: ScoreMode
  /** ratio 일 때 점수 = 보석 × gem + 골드 × gold */
  gem: number
  gold: number
}

export interface TeamResult {
  teamId: number
  name: string
  color: string
  gem: number
  gold: number
  score: number
  /** 공동 순위 허용 (1, 2, 2, 4) */
  rank: number
}

export interface GameResults {
  rule: ScoreRule
  teams: TeamResult[]
  publishedAt: string
}

// ---- 리더 선출 (팀원 전원 투표) ----

export type ElectionStatus = 'voting' | 'tie' | 'done'

export interface ElectionView {
  status: ElectionStatus
  /** 투표한 팀원 id (무기명: 누가 누구를 찍었는지는 공개하지 않는다) */
  voted: number[]
  /** 투표 대상 (활성 팀원) 수 */
  voters: number
  /** 내 투표 대상 (팀원 본인 화면에만) */
  myVote: number | null
  /** 결과 리더 (done) */
  leaderId: number | null
  /** 동표자 (tie → 관리자 지정 대기) */
  tied: number[]
  /** 득표 (done / tie 일 때만) */
  tally: Record<number, number> | null
}

// ---- 거래 ----

export type TradeStatus = 'requested' | 'awaiting_credit' | 'negotiating' | 'completed' | 'rejected' | 'cancelled'
export const ACTIVE_TRADE_STATUSES: readonly TradeStatus[] = ['requested', 'awaiting_credit', 'negotiating']

export interface TradeSide {
  teamId: number
  /** 제안한 재화 (제안 전 null). 상대에게는 제안 후에만 보인다 */
  offer: Resources | null
  accepted: boolean
}

export interface TradeView {
  id: number
  day: number
  status: TradeStatus
  /** 요청한 팀 */
  from: TradeSide
  /** 요청받은 팀 */
  to: TradeSide
  /** 크레딧을 낸 팀 */
  creditPayer: number | null
  updatedAt: string
}

// ---- 라이프 제출 ----

/**
 * 활성 팀원이 1명만 남은 팀은 라이프 제출이 없다 (자동 생존, 라이프 소모 없음). 인원은 그 시점 기준이라
 * 제출 단계 도중에 1명이 되면 바로 제출 불필요로 바뀐다. 0명인 팀은 제출할 사람이 없어 완료로 본다.
 */
export function isLifeExempt(activeMembers: number): boolean {
  return activeMembers === 1
}

/**
 * 라이프 제출로 살릴 수 있는 최대 인원 (= 쓸 수 있는 라이프 최대). 최소는 1.
 * 자진 탈락이면 리더를 뺀 팀원 수까지. 라이프가 0개면 0 (숫자 입력 없이 1명만 생존, 라이프 소모 없음)
 */
export function lifeSubmitMax(activeMembers: number, lives: number, selfEliminate: boolean): number {
  return Math.max(0, Math.min(lives, selfEliminate ? activeMembers - 1 : activeMembers))
}

export interface LifeSubmissionView {
  saved: number[]
  eliminated: number[]
  livesUsed: number
  /** 리더 자진 탈락 (리더 외 팀원 중 무작위로 생존자를 정함) */
  selfEliminated: boolean
  createdAt: string
}

// ---- 보석·골드 발행 (docs/97.보석골드_발행.md) ----

export type IssueKind = 'gem' | 'gold'
export type IssueLimits = Record<IssueKind, number>
export const DEFAULT_ISSUE_LIMITS: IssueLimits = { gem: 250, gold: 200 }

/** 발행 요청을 할 수 있는 팀 (groups.code). 팀 이름·색을 바꿔도 code 는 그대로다 */
export const ISSUE_TEAM_CODE: Record<IssueKind, string> = { gem: 'white', gold: 'yellow' }

export function issueKindOfTeam(code: string | null | undefined): IssueKind | null {
  if (code === ISSUE_TEAM_CODE.gem) return 'gem'
  if (code === ISSUE_TEAM_CODE.gold) return 'gold'
  return null
}

/** 마지막 라운드 발행 허용 단계 기본값: 룰의 "리더 협의 뒤" = 라이프 제출 */
export const DEFAULT_LAST_ISSUE_PHASES: readonly Phase[] = ['life']

/** 단계 목록을 PHASES 순서로 정리 (중복 제거) */
export function sortPhases(phases: readonly Phase[]): Phase[] {
  return PHASES.filter((p) => phases.includes(p))
}

export type IssueStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  pending: '수락 대기',
  approved: '수락됨',
  rejected: '거절됨',
  cancelled: '취소됨',
}

export interface IssueRequestView {
  id: number
  day: number
  teamId: number
  kind: IssueKind
  amount: number
  status: IssueStatus
  requestedBy: number | null
  requestedByName: string | null
  createdAt: string
  decidedAt: string | null
}

/**
 * 남은 발행 가능량. used = 대기 중 + 수락된 수량.
 * - 보석: 이번 일차 한도 − 이번 일차 사용량
 * - 골드: 한도 × 지금까지 일차 수 − 전체 사용량 (안 쓴 만큼 다음 일차로 이월)
 */
export function issueRemaining(kind: IssueKind, limit: number, day: number, used: { today: number; total: number }): number {
  const cap = kind === 'gem' ? limit - used.today : limit * day - used.total
  return Math.max(0, cap)
}

/** 화이트·옐로우팀 화면의 발행 정보 (그 팀만) */
export interface TeamIssueView {
  kind: IssueKind
  /** 지금 단계에서 요청할 수 있는지. 진행 중이면 모든 단계, 마지막 라운드는 관리자가 정한 단계만 (리더 여부·대기 요청·이번 라운드 발행은 따로) */
  open: boolean
  /** 마지막 라운드일 때만: 발행 허용 단계 (안내용). 마지막 라운드 발행량은 공개되지 않는다 */
  lastRoundPhases: Phase[] | null
  /** 이번 라운드(일차)에 수락된 발행이 있는지. 라운드당 1회라 있으면 더 요청할 수 없다 (거절은 횟수에 넣지 않음) */
  issuedToday: boolean
  /** 이번 일차 남은 발행 가능량 (대기 중 요청도 뺀 값) */
  remaining: number
  pending: IssueRequestView | null
  /** 최근 요청 (최신순) */
  recent: IssueRequestView[]
}

/** 팀원 화면용 (자기 팀만) */
export interface TeamGameView {
  resources: Resources
  election: ElectionView | null
  lifeSubmission: LifeSubmissionView | null
  /** 내 팀이 참여한 진행 중 거래 */
  trade: TradeView | null
  /** 화이트(보석)·옐로우(골드)팀만 */
  issue: TeamIssueView | null
  /** 내 팀이 선포해 관리자 승인을 기다리는 전쟁 (docs/99 §8). 공격팀만 안다 */
  warPending: { id: number; defender: number; cost: WarCost } | null
}

/** 관리자 화면용 팀 행 */
export interface AdminTeamRow {
  teamId: number
  resources: Resources
  initial: Resources
  activeMembers: number
  election: ElectionView | null
  lifeSubmission: LifeSubmissionView | null
}

export interface LedgerEntry {
  id: number
  teamId: number
  kind: ResourceKind
  delta: number
  amountAfter: number
  reason: LedgerReason
  day: number
  createdAt: string
}

export type LedgerReason = 'init' | 'production' | 'correction' | 'aid' | 'trade' | 'trade_credit' | 'life' | 'issue' | 'war_cost' | 'war_loss' | 'war_spoils'

export const LEDGER_REASON_LABELS: Record<LedgerReason, string> = {
  init: '초기 설정',
  production: '생산',
  correction: '정정',
  aid: '원조',
  trade: '거래',
  trade_credit: '거래 크레딧',
  life: '라이프 제출',
  issue: '발행',
  war_cost: '전쟁 비용',
  war_loss: '전쟁 패배',
  war_spoils: '전쟁 전리품',
}

/** 리더간 협의 원조 1건 */
export interface CouncilAidView {
  fromTeamId: number
  toTeamId: number
  amounts: Resources
}

export interface AdminGameView {
  state: GameState
  settings: GameSettings
  teams: AdminTeamRow[]
  /** 남은 라이프 매장량 */
  lifeReserve: number
  /** 이번 라운드 원조 (주는 팀 라운드당 1회, docs/100 D2). 진행 중이 아니면 빈 배열 */
  aidsToday: CouncilAidView[]
  trade: TradeView | null
  ledger: LedgerEntry[]
  /** 시작 전 점검 (준비 상태) */
  prep: {
    /** 팀을 고르지 않은 활성 참가자 (시작하면 비활성) */
    unassigned: number
    /** 활성 팀원이 있는데 리더가 지정되지 않은 팀 */
    noLeader: number[]
  }
  /** 보석·골드 발행 */
  issues: {
    /** 수락 대기 (오래된 순) */
    pending: IssueRequestView[]
    /** 최근 처리·요청 (최신순) */
    recent: IssueRequestView[]
    /** 이번 일차 남은 발행 가능량 (해당 팀이 없으면 null) */
    remaining: Record<IssueKind, number | null>
    /** 이번 라운드에 수락된 발행이 있는지 (라운드당 1회) */
    issuedToday: Record<IssueKind, boolean>
    /** 마지막 라운드일 때만: 그 라운드에 수락된 발행량 (비공개, 관리자 전용) */
    lastRound: Record<IssueKind, number> | null
  }
  /** 전쟁 */
  war: {
    /** 오늘 전쟁 기록 (진행 중이거나 끝난 것) */
    today: WarView | null
    /** 오늘 선포 비용 */
    todayCost: WarCost | null
    /** 다음 날 선포 비용 (입력해야 다음 날로 넘어간다. 마지막 날에는 필요 없음) */
    nextCost: WarCost | null
  }
}

export function isResources(v: unknown): v is Resources {
  return !!v && typeof v === 'object' && RESOURCE_KINDS.every((k) => Number.isInteger((v as Record<string, unknown>)[k]))
}

export function sumResources(list: Resources[]): Resources {
  const total = emptyResources()
  for (const r of list) for (const k of RESOURCE_KINDS) total[k] += r[k]
  return total
}

/** 등수 계산. 점수 내림차순, 같은 점수는 같은 등수 (1, 2, 2, 4). 동점 표시 순서는 보석 → 팀 id */
export function rankTeams(teams: Omit<TeamResult, 'score' | 'rank'>[], rule: ScoreRule): TeamResult[] {
  const scoreOf = (t: { gem: number; gold: number }) =>
    rule.mode === 'gem' ? t.gem : rule.mode === 'gold' ? t.gold : t.gem * rule.gem + t.gold * rule.gold
  const scored = teams
    .map((t) => ({ ...t, score: scoreOf(t), rank: 0 }))
    .sort((a, b) => b.score - a.score || b.gem - a.gem || a.teamId - b.teamId)
  scored.forEach((t, i) => {
    t.rank = i > 0 && scored[i - 1]!.score === t.score ? scored[i - 1]!.rank : i + 1
  })
  return scored
}

/**
 * 받침에 맞는 조사를 붙인다. josa('옐로우 팀', '이/가') → '옐로우 팀이', josa('화이트', '와/과') → '화이트와'.
 * 한글로 끝나지 않으면 '이(가)' 처럼 둘 다 표시.
 */
export function josa(word: string, pair: '이/가' | '을/를' | '은/는' | '와/과'): string {
  const [withFinal, withoutFinal] = pair.split('/') as [string, string]
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return `${word}${withFinal}(${withoutFinal})`
  return word + (code % 28 !== 0 ? withFinal : withoutFinal)
}
