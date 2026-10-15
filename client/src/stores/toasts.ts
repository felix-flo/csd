/**
 * 플로팅 알림(토스트). 공지(notice) 이벤트가 도착하면 화면 상단에 잠시 띄운다.
 * - 최대 3개 쌓이고, 기본 5초(프레젠테이션 10초) 후 자동으로 닫힌다. 마우스를 올리면 멈춘다.
 * - 어떤 이벤트를 띄울지는 realtime 스토어가 결정한다 (본인이 만든 이벤트·룰 갱신·시스템 메시지는 제외).
 */
import { defineStore } from 'pinia'
import type { GameEvent } from '../../../shared/types'
import { eventMessage, scopeLabel } from '../lib/eventLabel'

export interface Toast {
  id: number
  label: string
  message: string
  createdAt: string
  /** 남은 시간(ms). 호버 중에는 줄지 않는다 */
  remaining: number
}

const MAX = 3
const TICK = 100

export const useToastStore = defineStore('toasts', {
  state: () => ({
    items: [] as Toast[],
    duration: 5000,
    paused: false,
    timer: null as ReturnType<typeof setInterval> | null,
  }),
  actions: {
    /** 역할에 따라 표시 시간을 정한다 (프레젠테이션은 빔 출력용이라 길게) */
    configure(role: string | undefined) {
      this.duration = role === 'presenter' ? 10000 : 5000
    },
    show(ev: GameEvent) {
      if (this.items.some((t) => t.id === ev.id)) return
      this.items.push({
        id: ev.id,
        label: scopeLabel(ev),
        message: eventMessage(ev),
        createdAt: ev.createdAt,
        remaining: this.duration,
      })
      if (this.items.length > MAX) this.items.splice(0, this.items.length - MAX)
      this.ensureTimer()
    },
    dismiss(id: number) {
      this.items = this.items.filter((t) => t.id !== id)
    },
    clear() {
      this.items = []
    },
    setPaused(v: boolean) {
      this.paused = v
    },
    ensureTimer() {
      if (this.timer) return
      this.timer = setInterval(() => {
        if (this.paused) return
        for (const t of this.items) t.remaining -= TICK
        this.items = this.items.filter((t) => t.remaining > 0)
        if (this.items.length === 0 && this.timer) {
          clearInterval(this.timer)
          this.timer = null
        }
      }, TICK)
    },
  },
})
