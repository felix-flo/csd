import { defineStore } from 'pinia'
import type { LoginResponse, PublicUser, RefreshResponse } from '../../../shared/types'
import { api } from '../lib/api'
import { useRealtimeStore } from './realtime'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null as string | null,
    user: null as PublicUser | null,
    ready: false,
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
    /** 앱 시작 시 refresh cookie 가 살아있으면 조용히 재로그인 */
    async bootstrap() {
      try {
        if (await this.refresh()) {
          const me = await api.get<{ user: PublicUser }>('/api/me')
          this.user = me.user
          useRealtimeStore().connect()
        }
      } catch { this.clear() }
      this.ready = true
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
