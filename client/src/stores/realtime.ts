/**
 * Socket.IO 연결 + 이벤트 피드.
 * - 마지막으로 받은 이벤트 id 를 localStorage 에 저장, 재연결 시 서버에 replay 요청
 * - access token 만료 시 refresh 후 재연결
 */
import { defineStore } from 'pinia'
import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, GameEvent, ServerToClientEvents } from '../../../shared/types'
import { useAuthStore } from './auth'
import { useDocumentsStore } from './documents'
import { useToastStore } from './toasts'

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
    /** 재접속 replay 진행 중이면 토스트를 모아 두었다가 replay:done 에 최근 것만 띄운다 */
    replaying: false,
    pendingToasts: [] as GameEvent[],
  }),
  actions: {
    connect() {
      const auth = useAuthStore()
      if (socket || !auth.accessToken || !auth.user) return
      this.lastEventId = loadLastId(auth.user.id)
      this.events = []
      useToastStore().configure(auth.user.role)

      socket = io({
        auth: (cb) => cb({ token: useAuthStore().accessToken }),
        reconnectionDelayMax: 5000,
      })
      socket.on('connect', () => {
        this.connected = true
        this.replaying = true
        this.pendingToasts = []
        socket?.emit('replay', this.lastEventId)
      })
      socket.on('replay:done', () => {
        this.replaying = false
        // 밀린 공지는 최근 3건만 팝업, 나머지는 피드에서 확인
        for (const ev of this.pendingToasts.slice(-3)) useToastStore().show(ev)
        this.pendingToasts = []
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
      // 관리자가 알림 기록을 초기화하면 화면 피드에서도 해당 종류를 제거
      if (ev.type === 'system' && ev.payload.kind === 'events.cleared') {
        const types = Array.isArray(ev.payload.types) ? (ev.payload.types as string[]) : ['notice']
        const before = typeof ev.payload.before === 'number' ? ev.payload.before : Infinity
        this.events = this.events.filter((e) => !(types.includes(e.type) && e.id < before))
      }
      this.events.push(ev)
      if (ev.type === 'document.updated' && typeof ev.payload.slug === 'string') {
        useDocumentsStore().onUpdated(ev.payload.slug)
      }
      if (this.events.length > 200) this.events.splice(0, this.events.length - 200)
      if (this.shouldToast(ev)) {
        if (this.replaying) this.pendingToasts.push(ev)
        else useToastStore().show(ev)
      }
      if (ev.id > this.lastEventId) {
        this.lastEventId = ev.id
        const uid = useAuthStore().user?.id
        if (uid) saveLastId(uid, ev.id)
      }
    },
    /**
     * 플로팅 팝업을 띄울지. 서버가 본인 수신분만 보내므로 범위는 따로 거르지 않는다.
     * - 공지(notice)만. 룰 갱신은 배너가 있고, 시스템 메시지는 피드로 충분
     * - 본인이 만든 이벤트(진행자가 직접 보낸 공지)는 제외
     */
    shouldToast(ev: GameEvent): boolean {
      if (ev.type !== 'notice') return false
      const me = useAuthStore().user?.id
      return ev.createdBy == null || ev.createdBy !== me
    },
    disconnect() {
      socket?.disconnect()
      socket = null
      this.connected = false
      this.events = []
      this.replaying = false
      this.pendingToasts = []
      useToastStore().clear()
      useDocumentsStore().clear()
    },
  },
})
