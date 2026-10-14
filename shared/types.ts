// 서버/클라이언트 공용 타입. 룰 확정 전까지 최소한만 정의한다.

export type Role = 'admin' | 'presenter' | 'member'

export interface PublicUser {
  id: number
  name: string
  role: Role
  groupId: number | null
  isLeader: boolean
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

/** 이벤트 대상 범위: 전체 / 역할 / 그룹 / 개인 */
export type EventScope = 'all' | 'role' | 'group' | 'user'

/** 이벤트 종류. 룰 확정 후 거래/전쟁 요청 등을 추가한다. */
export type EventType = 'notice' | 'system'

export interface GameEvent {
  id: number
  type: EventType
  scope: EventScope
  targetId: number | null
  /** role scope 일 때 대상 역할 */
  targetRole: Role | null
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
