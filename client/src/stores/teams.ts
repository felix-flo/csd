/**
 * 팀 목록 캐시 (id, code, name, color). 모든 역할이 쓴다.
 * - 소켓 연결 시 불러오고, 관리자가 팀을 바꾸면 system 이벤트(teams.updated)로 다시 불러온다.
 * - 알림 피드의 팀 뱃지 색, 거래 화면의 상대 팀 표시에 사용.
 */
import { defineStore } from 'pinia'
import type { GroupInfo } from '../../../shared/types'
import { api } from '../lib/api'

export const useTeamsStore = defineStore('teams', {
  state: () => ({ teams: [] as GroupInfo[] }),
  getters: {
    byId: (s) => (id: number | null | undefined) => (id == null ? undefined : s.teams.find((t) => t.id === id)),
  },
  actions: {
    async load(): Promise<boolean> {
      try {
        const res = await api.get<{ teams: GroupInfo[] }>('/api/teams')
        this.teams = res.teams
        return true
      } catch { return false }
    },
    colorOf(id: number | null | undefined): string | undefined {
      return this.byId(id)?.color
    },
    clear() {
      this.teams = []
    },
  },
})
