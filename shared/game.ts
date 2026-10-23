/**
 * 게임 진행 정의 (서버/클라이언트 공용). 설계·결정 경위: docs/95.게임진행_설계.md
 * - 게임 상태: setup(설정) → ready(준비: 참가자 입장·팀 선택) → running(진행, day/phase) → ended(종료, 등수 발표)
 * - 하루 흐름: 리더 선출 → 생산 활동 → 거래 활동 → 리더간 협의 → 라이프 제출. 단계 전환은 관리자 버튼으로만.
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
  production: '생산 활동',
  trade: '거래 활동',
  council: '리더간 협의',
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

export interface LifeSubmissionView {
  saved: number[]
  eliminated: number[]
  livesUsed: number
  createdAt: string
}

/** 팀원 화면용 (자기 팀만) */
export interface TeamGameView {
  resources: Resources
  election: ElectionView | null
  lifeSubmission: LifeSubmissionView | null
  /** 내 팀이 참여한 진행 중 거래 */
  trade: TradeView | null
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

export type LedgerReason = 'init' | 'production' | 'correction' | 'aid' | 'trade' | 'trade_credit' | 'life'

export const LEDGER_REASON_LABELS: Record<LedgerReason, string> = {
  init: '초기 설정',
  production: '생산',
  correction: '정정',
  aid: '원조',
  trade: '거래',
  trade_credit: '거래 크레딧',
  life: '라이프 제출',
}

export interface AdminGameView {
  state: GameState
  settings: GameSettings
  teams: AdminTeamRow[]
  /** 남은 라이프 매장량 */
  lifeReserve: number
  /** 원조 사용 여부 (게임 전체 1회) */
  aidUsed: boolean
  trade: TradeView | null
  ledger: LedgerEntry[]
  /** 시작 전 점검 (준비 상태) */
  prep: {
    /** 팀을 고르지 않은 활성 참가자 (시작하면 비활성) */
    unassigned: number
    /** 활성 팀원이 있는데 리더가 지정되지 않은 팀 */
    noLeader: number[]
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
