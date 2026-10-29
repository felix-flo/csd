import { defineStore } from 'pinia'
import type { LoginResponse, PublicUser, RefreshResponse } from '../../../shared/types'
import { api } from '../lib/api'
import { useRealtimeStore } from './realtime'

/** 탈락 화면을 보여주는 시간 */
const ELIMINATED_MS = 5000

/**
 * 테스트 모드(탭 로그인, docs/101): 서버가 리프레시 쿠키 대신 tabLogin 을 주면 액세스 토큰을 탭 저장소에 둔다.
 * sessionStorage 는 탭마다 따로라 새 탭은 로그인 화면이고, 새로고침은 유지된다. 만료되면 재발급 없이 로그아웃.
 */
const TAB_TOKEN_KEY = 'csd:access'
function loadTabToken(): string | null {
  try { return sessionStorage.getItem(TAB_TOKEN_KEY) } catch { return null }
}
function saveTabToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TAB_TOKEN_KEY, token)
    else sessionStorage.removeItem(TAB_TOKEN_KEY)
  } catch { /* ignore */ }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null as string | null,
    user: null as PublicUser | null,
    /** 탭 로그인 세션 (액세스 토큰이 sessionStorage 에 있음). 재발급을 시도하지 않는다 */
    tabLogin: false,
    ready: false,
    bootstrapping: null as Promise<void> | null,
    /** 탈락 통보를 받음 → "탈락되었습니다" 화면을 5초 보여준 뒤 로그아웃. 그동안 401·연결 끊김으로 먼저 로그아웃하지 않는다 */
    eliminated: false,
  }),
  getters: {
    isLoggedIn: (s) => !!s.accessToken && !!s.user,
    homePath(): string {
      switch (this.user?.role) {
        case 'admin': return '/admin'
        case 'presenter': return '/present'
        case 'member': return '/group'
        default: return '/login'
      }
    },
  },
  actions: {
    /**
     * 앱 시작 시 조용히 재로그인. 여러 곳에서 불려도 1회만 실행.
     * ① 탭 저장소에 액세스 토큰이 있으면(테스트 모드) 그걸로, 만료됐으면 지우고 ② refresh cookie 로
     */
    bootstrap(): Promise<void> {
      if (this.ready) return Promise.resolve()
      if (!this.bootstrapping) {
        this.bootstrapping = (async () => {
          try {
            const tab = loadTabToken()
            if (tab) {
              this.accessToken = tab
              this.tabLogin = true
            }
            if (tab || (await this.refresh())) {
              const me = await api.get<{ user: PublicUser }>('/api/me')
              this.user = me.user
              useRealtimeStore().connect()
            }
          } catch { this.clear() }
          this.ready = true
        })()
      }
      return this.bootstrapping
    },
    async login(pin: string) {
      const res = await api.post<LoginResponse>('/api/auth/login', { pin })
      this.accessToken = res.accessToken
      this.user = res.user
      this.tabLogin = !!res.tabLogin
      saveTabToken(res.tabLogin ? res.accessToken : null)
      useRealtimeStore().connect()
    },
    /** 액세스 토큰 재발급. 탭 로그인 세션은 재발급이 없으므로 바로 false (→ 로그아웃) */
    async refresh(): Promise<boolean> {
      if (this.tabLogin) return false
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
        if (!res.ok) return false
        const body = (await res.json()) as RefreshResponse
        this.accessToken = body.accessToken
        return true
      } catch { return false }
    },
    /** 서버 기준으로 내 정보(팀·리더 여부 등)를 다시 읽는다. 팀 이동 알림을 받았을 때 호출 */
    async refreshMe() {
      try {
        const me = await api.get<{ user: PublicUser }>('/api/me')
        this.user = me.user
      } catch { /* 다음 요청 때 다시 시도 */ }
    },
    /** 첫 로그인 때 본인 이름 설정 */
    async setName(name: string) {
      const res = await api.post<{ user: PublicUser }>('/api/me/name', { name })
      this.user = res.user
    },
    async logout() {
      try { await api.post('/api/auth/logout') } catch { /* ignore */ }
      this.clear()
    },
    clear() {
      useRealtimeStore().disconnect()
      this.accessToken = null
      this.user = null
      this.tabLogin = false
      saveTabToken(null)
    },
    /** 서버의 탈락 통보 (session:ended 'eliminated'). 5초 뒤 로그아웃하고 로그인 화면으로 */
    eliminate() {
      if (this.eliminated) return
      this.eliminated = true
      setTimeout(async () => {
        this.clear()
        this.eliminated = false
        const { router } = await import('../router')
        void router.replace('/login')
      }, ELIMINATED_MS)
    },
  },
})
