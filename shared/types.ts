// 서버/클라이언트 공용 타입. 룰 확정 전까지 최소한만 정의한다.

export type Role = 'admin' | 'presenter' | 'member'

export interface PublicUser {
  id: number
  name: string
  role: Role
  groupId: number | null
  isLeader: boolean
  /** 참가자가 첫 로그인 때 본인 이름을 입력했는지. false 면 이름 입력 화면을 먼저 보여준다 */
  nameSet: boolean
}

/** 관리자 화면용 유저 정보 (비활성 계정 포함) */
export interface AdminUser extends PublicUser {
  active: boolean
  /** 평문 PIN (관리자 응답에만 포함) */
  pin: string | null
  groupCode: string | null
  groupName: string | null
  groupColor: string | null
  /** 시드 테스트 계정 (팀별 리더·팀원). 게임 설정에서 포함 여부를 정한다 */
  isTest: boolean
  /** 리셋해도 남는 고정 계정 (관리자 1명 + 프레젠테이션). 진행자·참가자는 리셋 때 삭제 */
  isFixed: boolean
  /** 마지막 로그인 시각 (UTC 'YYYY-MM-DD HH:MM:SS'). 한 번도 로그인하지 않았으면 null */
  lastLoginAt: string | null
}

export interface GroupInfo {
  id: number
  code: string
  name: string
  /** 팀 색 '#rrggbb' (groups.team_color). 이름 앞 색 점에 쓴다 */
  color: string
}

export interface LoginResponse {
  accessToken: string
  user: PublicUser
}

export interface RefreshResponse {
  accessToken: string
}

export interface MeResponse {
  user: PublicUser
  group: GroupInfo | null
}

/** 관리자가 작성하고 모든 역할이 읽는 마크다운 문서 (룰 등) */
export interface DocumentInfo {
  slug: string
  title: string
  markdown: string
  /** 직전 버전이 보관되어 있어 되돌릴 수 있는지 */
  hasPrevious: boolean
  updatedBy: number | null
  updatedAt: string
}

/** 이벤트 대상 범위: 전체 / 역할 / 그룹 / 개인 */
export type EventScope = 'all' | 'role' | 'group' | 'user'

/**
 * 이벤트 종류.
 * - game  : 게임 진행 (단계·일차 전환, 리더 선출, 재화 변동, 라이프 제출, 등수 발표). payload.kind 는 GameKind
 * - trade : 거래 (요청·수락·제안·완료·취소). 거래 당사자 두 팀에 scope=group 으로만 보낸다 (관리자는 전부 받음)
 */
export type EventType = 'notice' | 'system' | 'document.updated' | 'game' | 'trade'

/**
 * game 이벤트의 payload.kind.
 * - game.updated       : 시작·단계/일차 전환·종료 (scope=all). 클라이언트는 게임 상태 재조회
 * - game.reset         : 리셋 (scope=all)
 * - game.results       : 등수 발표 (scope=all)
 * - election.progress  : 팀원이 투표함 (scope=group, 팝업 없음)
 * - election.done      : 팀 리더 확정 (scope=group)
 * - election.tie       : 동표 → 관리자 지정 대기 (scope=group)
 * - election.all_done  : 모든 팀 리더 선출 완료 (scope=all)
 * - resources.updated  : 팀 재화 변동 (scope=group)
 * - life.submitted     : 팀 라이프 제출 (scope=group)
 * - life.all_done      : 모든 팀 라이프 제출 완료 (scope=all)
 */
export type GameKind =
  | 'game.updated' | 'game.reset' | 'game.results'
  | 'election.progress' | 'election.done' | 'election.tie' | 'election.all_done'
  | 'resources.updated' | 'life.submitted' | 'life.all_done'

/**
 * system 이벤트의 payload.kind.
 * - events.cleared   : 공지 기록 초기화 (scope=all)
 * - teams.updated    : 팀 추가/수정/삭제 → 클라이언트는 팀 목록 재조회 (scope=all)
 * - member.moved     : 참가자 팀 이동. 이전 팀과 새 팀에 각각 scope=group 으로 1건씩 (이동한 본인은 새 팀 것만 받는다)
 * - members.active   : 탈락(비활성)/복귀 처리. 영향 받은 팀마다 scope=group 1건
 * - leader.set       : 관리자가 리더 지정 (scope=group)
 */
export type SystemKind = 'events.cleared' | 'teams.updated' | 'member.moved' | 'members.active' | 'leader.set'

export interface GameEvent {
  id: number
  type: EventType
  scope: EventScope
  targetId: number | null
  /** role scope 일 때 대상 역할 */
  targetRole: Role | null
  /** group/user scope 일 때 대상의 현재 이름 (표시용, 서버가 조회해 채움) */
  targetName: string | null
  payload: Record<string, unknown>
  createdBy: number | null
  createdAt: string
}

/** Socket.IO 서버 -> 클라이언트 */
export interface ServerToClientEvents {
  'event': (ev: GameEvent) => void
  'replay:done': (lastId: number) => void
  /**
   * 기록하지 않는 가벼운 신호. 'lobby' = 준비 상태의 팀 선택 현황이 바뀜 → 게임 상태(관리자는 계정 목록도) 재조회.
   * 놓쳐도 재접속 때 상태를 다시 받으므로 outbox(events) 에 남기지 않는다
   */
  'signal': (kind: 'lobby') => void
}

/** Socket.IO 클라이언트 -> 서버 */
export interface ClientToServerEvents {
  'replay': (afterId: number) => void
}
