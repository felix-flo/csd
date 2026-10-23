/**
 * 게임 진행 상태 캐시.
 * - state: 모든 역할 공용 (일차·단계·초기 재화 합계·발표된 등수) → 상단 단계 표시줄, 프레젠테이션
 * - team : 참가자 본인 팀 (재화·리더 투표·라이프 제출·거래)
 * - admin: 관리자 전체 보기
 * game/trade 이벤트가 오면 realtime 스토어가 version 을 올리고, 여기서 다시 불러온다.
 */
import { defineStore } from 'pinia'
import type { AdminGameView, GameState, TeamGameView } from '../../../shared/game'
import { api } from '../lib/api'
import { useAuthStore } from './auth'

export const useGameStore = defineStore('game', {
  state: () => ({
    state: null as GameState | null,
    team: null as TeamGameView | null,
    admin: null as AdminGameView | null,
    /** 동시에 여러 이벤트가 와도 한 번만 다시 부르도록 */
    loading: null as Promise<void> | null,
    again: false,
  }),
  actions: {
    /** 역할에 맞는 정보를 다시 받는다. 진행 중이면 끝난 뒤 한 번 더 */
    load(): Promise<void> {
      if (this.loading) {
        this.again = true
        return this.loading
      }
      this.loading = (async () => {
        do {
          this.again = false
          try {
            const role = useAuthStore().user?.role
            if (role === 'admin') {
              this.admin = await api.get<AdminGameView>('/api/admin/game')
              this.state = this.admin.state
            } else {
              this.state = (await api.get<{ state: GameState }>('/api/game')).state
              if (role === 'member') this.team = await api.get<TeamGameView>('/api/game/team').catch(() => null)
            }
          } catch { /* 다음 이벤트 때 다시 시도 */ }
        } while (this.again)
        this.loading = null
      })()
      return this.loading
    },
    /** 관리자 API 응답(AdminGameView)을 바로 반영 */
    setAdmin(v: AdminGameView) {
      this.admin = v
      this.state = v.state
    },
    clear() {
      this.state = null
      this.team = null
      this.admin = null
    },
  },
})
