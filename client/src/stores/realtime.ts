/**
 * Socket.IO 연결 + 이벤트 피드.
 * - 마지막으로 받은 이벤트 id 를 localStorage 에 저장, 재연결 시 서버에 replay 요청
 * - access token 만료 시 refresh 후 재연결
 */
import { defineStore } from 'pinia'
import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, GameEvent, ServerToClientEvents } from '../../../shared/types'
import { useAuthStore } from './auth'

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>
let socket: AppSocket | null = null

const LAST_ID_KEY = 'csd:lastEventId'

function loadLastId(userId: number): number {
  try { return Number(localStorage.getItem(`${LAST_ID_KEY}:${userId}`) ?? 0) || 0 } catch { return 0 }
}
function saveLastId(userId: number, id: number) {
  try { localStorage.setItem(`${LAST_ID_KEY}:${userId}`, String(id)) } catch { /* ignore */ }
}

export const useRealtimeStore = defineStore('realtime', {
  state: () => ({
    connected: false,
    events: [] as GameEvent[],
    lastEventId: 0,
  }),
  actions: {
    connect() {
      const auth = useAuthStore()
      if (socket || !auth.accessToken || !auth.user) return
      this.lastEventId = loadLastId(auth.user.id)
      this.events = []

      socket = io({
        auth: (cb) => cb({ token: useAuthStore().accessToken }),
        reconnectionDelayMax: 5000,
      })
      socket.on('connect', () => {
        this.connected = true
        socket?.emit('replay', this.lastEventId)
      })
      socket.on('disconnect', () => { this.connected = false })
      socket.on('connect_error', async (err) => {
        if (err.message === 'unauthorized') {
          // access token 만료 → refresh 후 socket.io 가 자동 재시도
          const ok = await auth.refresh()
          if (!ok) auth.clear()
        }
      })
      socket.on('event', (ev) => this.push(ev))
    },
    push(ev: GameEvent) {
      if (this.events.some((e) => e.id === ev.id)) return
      this.events.push(ev)
      if (this.events.length > 200) this.events.splice(0, this.events.length - 200)
      if (ev.id > this.lastEventId) {
        this.lastEventId = ev.id
        const uid = useAuthStore().user?.id
        if (uid) saveLastId(uid, ev.id)
      }
    },
    disconnect() {
      socket?.disconnect()
      socket = null
      this.connected = false
      this.events = []
    },
  },
})
