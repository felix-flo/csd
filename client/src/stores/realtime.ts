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
import { useTeamsStore } from './teams'
import { useGameStore } from './game'
import { useToastStore } from './toasts'
import { api } from '../lib/api'

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
    /** 팀원 구성이 바뀌었을 때(팀 이동·탈락·복귀) 올라가는 카운터. 팀 화면이 보고 팀원 목록을 다시 받는다 */
    groupVersion: 0,
    /** 서버가 서빙 중인 클라이언트 빌드와 내 번들이 다르면 true → "새 버전" 배너 */
    outdated: false,
    serverVersion: '' as string,
    reloading: false,
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
      socket.on('connect', async () => {
        this.connected = true
        // 0) 배포로 서버가 재시작돼 재연결된 경우를 잡기 위해 버전 확인
        this.checkVersion()
        // 1) 최근 기록으로 피드를 채운다 (팝업 없음). 새로고침·재로그인 후에도 지난 알림이 보이도록
        await this.loadRecent()
        void useTeamsStore().load()
        void useGameStore().load()
        // 2) 마지막으로 본 id 이후 것만 replay → 놓친 공지는 팝업
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
      socket.on('disconnect', async (reason) => {
        this.connected = false
        // 서버가 끊은 경우(탈락·PIN 리셋·게임 리셋으로 계정 삭제): 세션이 살아 있으면 다시 연결, 아니면 로그인 화면으로
        if (reason !== 'io server disconnect') return
        // 탈락: 탈락 화면(5초)이 끝나면 auth.eliminate() 가 로그아웃한다
        if (auth.eliminated) return
        if (await auth.refresh()) {
          socket?.connect()
          return
        }
        auth.clear()
        const { router } = await import('../router')
        void router.replace('/login')
      })
      socket.on('connect_error', async (err) => {
        if (err.message === 'unauthorized') {
          // access token 만료 → refresh 후 socket.io 가 자동 재시도
          const ok = await auth.refresh()
          if (!ok) auth.clear()
        }
      })
      // 서버가 끊기 직전에 보내는 사유. 탈락이면 "탈락되었습니다" 5초 후 로그아웃
      socket.on('session:ended', (reason) => {
        if (reason === 'eliminated') auth.eliminate()
      })
      socket.on('event', (ev) => this.push(ev))
      // 팀 구성 변경 (기록 없는 신호): 게임 상태를 다시 받고, 관리자는 계정 목록도 (프레젠테이션 팀 현황은 게임 상태 갱신에 맞춰 다시 받음)
      socket.on('signal', (kind) => {
        if (kind !== 'lobby') return
        void useGameStore().load()
        if (useAuthStore().user?.role === 'admin') this.groupVersion++
      })
    },
    /**
     * 최근 50건을 받아 피드에 넣는다. 토스트는 띄우지 않고 lastEventId 도 올리지 않는다 (replay 가 판단).
     * replace=true 면 피드를 서버 기준으로 통째로 교체한다 (수동 "다시 불러오기")
     */
    async loadRecent(replace = false): Promise<boolean> {
      try {
        const res = await api.get<{ events: GameEvent[] }>('/api/events?recent=50')
        if (replace) {
          this.events = res.events
        } else {
          const known = new Set(this.events.map((e) => e.id))
          const fresh = res.events.filter((e) => !known.has(e.id))
          this.events = [...fresh, ...this.events].sort((a, b) => a.id - b.id)
        }
        return true
      } catch { return false } // 피드 기록은 보조 기능이라 실패해도 연결은 유지
    },
    /** 소켓을 끊고 다시 연결 (연결 끊김 뱃지 클릭). access token 이 만료됐을 수 있어 먼저 refresh */
    async reconnect() {
      const auth = useAuthStore()
      socket?.disconnect()
      socket = null
      this.connected = false
      await auth.refresh()
      this.connect()
    },
    /** 서버의 클라이언트 빌드 식별자와 내 번들을 비교. 다르면 배너 표시 (개발 서버는 둘 다 'dev') */
    async checkVersion() {
      if (__BUILD_ID__ === 'dev') return // vite 개발 서버: 서버에 dist 가 있어도 비교 대상이 아님
      try {
        const res = await fetch('/api/health', { cache: 'no-store' })
        const body = (await res.json()) as { version?: string }
        this.serverVersion = body.version ?? ''
        this.outdated = !!body.version && body.version !== __BUILD_ID__
      } catch { /* 네트워크 오류면 다음 재연결 때 다시 확인 */ }
    },
    /** 새 버전 적용: 캐시 무시 새로고침 */
    reloadForUpdate() {
      this.reloading = true
      window.location.reload()
    },
    push(ev: GameEvent) {
      // 마지막으로 본 id 보다 크면 "처음 보는" 이벤트. 피드에 이미 있어도(loadRecent 로 채운 경우) 팝업·배너는 띄운다
      const unseen = ev.id > this.lastEventId
      if (!this.events.some((e) => e.id === ev.id)) {
        // 관리자가 알림 기록을 초기화하면 화면 피드에서도 해당 종류를 제거
        if (ev.type === 'system' && ev.payload.kind === 'events.cleared') {
          const types = Array.isArray(ev.payload.types) ? (ev.payload.types as string[]) : ['notice']
          const before = typeof ev.payload.before === 'number' ? ev.payload.before : Infinity
          this.events = this.events.filter((e) => !(types.includes(e.type) && e.id < before))
        }
        if (ev.type === 'system') this.onSystem(ev)
        if (ev.type === 'game' || ev.type === 'trade') this.onGame(ev)
        this.events.push(ev)
        if (this.events.length > 200) this.events.splice(0, this.events.length - 200)
      }
      if (!unseen) return
      if (ev.type === 'document.updated' && typeof ev.payload.slug === 'string') {
        useDocumentsStore().onUpdated(ev.payload.slug)
      }
      if (this.shouldToast(ev)) {
        if (this.replaying) this.pendingToasts.push(ev)
        else useToastStore().show(ev)
      }
      this.lastEventId = ev.id
      const uid = useAuthStore().user?.id
      if (uid) saveLastId(uid, ev.id)
    },
    /** 처음 받는 system 이벤트의 부수효과: 팀 목록 갱신, 팀원 구성 변경, 내 팀 이동 */
    onSystem(ev: GameEvent) {
      const kind = ev.payload.kind
      if (kind === 'teams.updated') void useTeamsStore().load()
      if (kind === 'member.moved' || kind === 'members.active' || kind === 'leader.set') {
        this.groupVersion++
        // 내가 이동했거나 리더로 지정된 경우: 토큰은 그대로 두고 /api/me 로 팀·리더 정보만 다시 받는다 (재로그인 불필요)
        if ((kind === 'member.moved' || kind === 'leader.set') && ev.payload.userId === useAuthStore().user?.id) void useAuthStore().refreshMe()
      }
    },
    /**
     * game/trade 이벤트: 게임 상태를 다시 받는다. 리더가 바뀌거나 팀원이 탈락하면 내 정보·팀원 목록도 갱신.
     * replay 로 지난 이벤트가 몰려와도 game 스토어가 한 번으로 합친다.
     */
    onGame(ev: GameEvent) {
      void useGameStore().load()
      const kind = ev.payload.kind
      // 리셋은 서버의 알림 기록을 모두 지운다 → 화면 피드도 이 이벤트 이전 것을 비운다
      if (kind === 'game.reset') this.events = this.events.filter((e) => e.id >= ev.id)
      if (kind === 'election.done' || kind === 'life.submitted' || kind === 'game.reset') {
        this.groupVersion++
        void useAuthStore().refreshMe()
      }
    },
    /**
     * 플로팅 팝업을 띄울지. 서버가 본인 수신분만 보내므로 범위는 따로 거르지 않는다.
     * - 공지(notice), 팀 이동·탈락/복귀·리더 지정 시스템 알림, 게임 진행·거래 알림. 룰 갱신은 배너가 있고, 그 외 시스템 메시지는 피드로 충분
     * - 본인이 만든 이벤트(진행자가 직접 보낸 공지·처리)는 제외. 단 payload.notifySelf(참가자 행동의 결과 알림)는 본인에게도
     */
    shouldToast(ev: GameEvent): boolean {
      const popup =
        ev.type === 'notice' ||
        // (이주 수락의 팀 이동 신호는 silent — 전체 이주 공지가 따로 뜬다)
        (ev.type === 'system' && !ev.payload.silent && (ev.payload.kind === 'member.moved' || ev.payload.kind === 'members.active' || ev.payload.kind === 'leader.set')) ||
        // 게임 진행·거래 알림. silent(투표 진행 상황, 설정 변경 등)는 피드에만
        ((ev.type === 'game' || ev.type === 'trade') && !ev.payload.silent)
      if (!popup) return false
      // 발행 요청은 관리자 화면이 요청 창(IssueAdminCard)으로 띄우므로 토스트는 겹치지 않게 뺀다
      if (ev.payload.kind === 'issue.requested' && useAuthStore().user?.role === 'admin') return false
      // 결과 알림(모든 팀 완료·리더 선출 결과·거래 완료)은 마지막으로 행동한 본인에게도 띄운다 (서버가 notifySelf 로 표시)
      if (ev.payload.notifySelf) return true
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
      useTeamsStore().clear()
      useGameStore().clear()
    },
  },
})
