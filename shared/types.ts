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
}

export interface GroupInfo {
  id: number
  code: string
  name: string
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

/** 이벤트 종류. 룰 확정 후 거래/전쟁 요청 등을 추가한다. */
export type EventType = 'notice' | 'system' | 'document.updated'

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
}

/** Socket.IO 클라이언트 -> 서버 */
export interface ClientToServerEvents {
  'replay': (afterId: number) => void
}
