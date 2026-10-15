import { defineStore } from 'pinia'
import type { LoginResponse, PublicUser, RefreshResponse } from '../../../shared/types'
import { api } from '../lib/api'
import { useRealtimeStore } from './realtime'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null as string | null,
    user: null as PublicUser | null,
    ready: false,
    bootstrapping: null as Promise<void> | null,
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
    /** 앱 시작 시 refresh cookie 가 살아있으면 조용히 재로그인. 여러 곳에서 불려도 1회만 실행 */
    bootstrap(): Promise<void> {
      if (this.ready) return Promise.resolve()
      if (!this.bootstrapping) {
        this.bootstrapping = (async () => {
          try {
            if (await this.refresh()) {
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
      useRealtimeStore().connect()
    },
    async refresh(): Promise<boolean> {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
        if (!res.ok) return false
        const body = (await res.json()) as RefreshResponse
        this.accessToken = body.accessToken
        return true
      } catch { return false }
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
    },
  },
})
