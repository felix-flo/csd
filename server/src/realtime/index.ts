import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'
import { verifyAccessToken } from '../auth/tokens.js'
import { findUserById } from '../db/users.js'
import { listEventsForUser } from '../db/events.js'
import type { ClientToServerEvents, GameEvent, ServerToClientEvents } from '../../../shared/types.js'

type IO = Server<ClientToServerEvents, ServerToClientEvents>
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>
let io: IO | null = null

/** 유저별 접속 소켓 (팀 이동 시 룸을 옮기기 위해 추적) */
const socketsByUser = new Map<number, Set<AppSocket>>()

/** 룸 명명 규칙 */
export const rooms = {
  all: 'all',
  role: (r: string) => `role:${r}`,
  group: (id: number) => `group:${id}`,
  user: (id: number) => `user:${id}`,
}

export function initRealtime(httpServer: HttpServer): IO {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    // 같은 origin 에서 서빙하므로 CORS 불필요. 개발 시엔 vite proxy 를 통해 접속.
    serveClient: false,
  })

  // 핸드셰이크 시 access token 검증. 팀·리더 여부는 토큰이 아니라 DB 기준
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    const claims = token ? verifyAccessToken(token) : null
    const user = claims ? findUserById(claims.sub) : null
    if (!user) return next(new Error('unauthorized'))
    socket.data.user = user
    next()
  })

  io.on('connection', (socket) => {
    const user = socket.data.user!
    socket.join(rooms.all)
    socket.join(rooms.role(user.role))
    socket.join(rooms.user(user.id))
    if (user.groupId) socket.join(rooms.group(user.groupId))
    if (!socketsByUser.has(user.id)) socketsByUser.set(user.id, new Set())
    socketsByUser.get(user.id)!.add(socket)
    console.log(`[ws] connected user=${user.id} role=${user.role} group=${user.groupId ?? '-'}`)

    // 클라이언트가 마지막으로 받은 이벤트 id 를 보내면 그 이후 것을 순서대로 재전송.
    // 팀은 접속 중에 바뀔 수 있으므로 replay 때마다 DB 에서 현재 상태를 다시 읽는다.
    socket.on('replay', (afterId) => {
      const current = findUserById(user.id) ?? user
      socket.data.user = current
      const events = listEventsForUser(current, Number(afterId) || 0)
      for (const ev of events) socket.emit('event', ev)
      socket.emit('replay:done', events.at(-1)?.id ?? (Number(afterId) || 0))
    })

    socket.on('disconnect', (reason) => {
      const set = socketsByUser.get(user.id)
      set?.delete(socket)
      if (set && set.size === 0) socketsByUser.delete(user.id)
      console.log(`[ws] disconnected user=${user.id} (${reason})`)
    })
  })

  return io
}

/** 해당 유저들의 소켓을 강제 종료 (계정 비활성화 시) */
export function disconnectUsers(userIds: number[]) {
  if (!io) return
  for (const id of userIds) io.in(rooms.user(id)).disconnectSockets(true)
}

/**
 * 팀 이동: 접속 중인 소켓을 이전 팀 룸에서 빼고 새 팀 룸에 넣는다 (재로그인 불필요).
 * 알림을 보내기 **전에** 호출해야 이동한 본인이 이전 팀 알림을 받지 않는다.
 */
export function moveUserRooms(userId: number, fromGroupId: number | null, toGroupId: number | null) {
  for (const socket of socketsByUser.get(userId) ?? []) {
    if (fromGroupId != null) socket.leave(rooms.group(fromGroupId))
    if (toGroupId != null) socket.join(rooms.group(toGroupId))
    if (socket.data.user) socket.data.user = { ...socket.data.user, groupId: toGroupId }
  }
}

/** DB 에 기록된 이벤트를 대상 룸으로 전송. 진행자(admin)는 범위와 무관하게 모든 이벤트를 받는다 */
export function publishEvent(ev: GameEvent) {
  if (!io) return
  const adminAlreadyIncluded = ev.scope === 'all' || (ev.scope === 'role' && ev.targetRole === 'admin')
  if (!adminAlreadyIncluded) io.to(rooms.role('admin')).emit('event', ev)
  switch (ev.scope) {
    case 'all':
      io.to(rooms.all).emit('event', ev)
      break
    case 'role':
      if (ev.targetRole) io.to(rooms.role(ev.targetRole)).emit('event', ev)
      break
    case 'group':
      if (ev.targetId != null) io.to(rooms.group(ev.targetId)).emit('event', ev)
      break
    case 'user':
      if (ev.targetId != null) io.to(rooms.user(ev.targetId)).emit('event', ev)
      break
  }
}

declare module 'socket.io' {
  interface SocketData {
    user?: import('../../../shared/types.js').PublicUser
  }
}
