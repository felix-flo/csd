/**
 * 플로팅 알림(토스트). 공지(notice) 이벤트가 도착하면 화면 상단에 잠시 띄운다.
 * - 최대 3개 쌓인다. 가장 최근 알림은 사용자가 닫기(✕)를 누를 때까지 남고, 그 앞의 알림들은 기본 5초(프레젠테이션 10초) 뒤 자동으로 닫힌다
 *   (docs/103 §6). 새 알림이 오면 직전 알림부터 타이머가 돈다. 마우스를 올리면 멈춘다.
 * - 어떤 이벤트를 띄울지는 realtime 스토어가 결정한다 (공지와 팀 이동/탈락 알림만. 본인이 만든 이벤트·룰 갱신은 제외).
 * - 알림음(lib/chime.ts): 프레젠테이션·참가자(리더/팀원)만 듣고 관리자는 듣지 않는다.
 *   울리는 경우는 shouldChime() 이 정한다 — 전체 범위 공지·시스템 알림만. 팀(이동·탈락·거래 등)·개인 알림은 팝업만 뜨고 소리는 없다.
 *   기기별로 끌 수 있다(muted). replay 로 여러 개가 한꺼번에 뜨면 한 번만 울린다.
 * - held: 시작 인트로 이미지(IntroOverlay)가 덮고 있는 동안은 시간이 줄지 않는다 → 이미지가 사라진 뒤 온전히 보인다.
 */
import { defineStore } from 'pinia'
import type { GameEvent } from '../../../shared/types'
import { eventMessage, scopeLabel } from '../lib/eventLabel'
import { isMuted, playChime, setMuted } from '../lib/chime'

export interface Toast {
  id: number
  label: string
  message: string
  createdAt: string
  /** 남은 시간(ms). 호버 중에는 줄지 않는다. 가장 최근 알림(sticky)은 줄지 않는다 */
  remaining: number
  /** 전쟁 알림: 빨간 강조 팝업 (payload.war) */
  war: boolean
}

const MAX = 3
const TICK = 100

/**
 * 소리를 낼 이벤트인지.
 * - 전체 공지·전체 시스템 알림·전체 게임 알림(단계 전환, 모든 팀 리더 선출/라이프 제출 완료, 등수 발표): scope 'all', 또는 역할 전체('role')
 * - 그 외(팀 공지·팀 이동/탈락 알림·거래 알림, 개인 알림)는 팝업만. 전쟁 선포는 룰 확정 후 여기에 추가한다.
 * - payload.muted (보석·골드 발행 알림)는 범위와 무관하게 팝업만.
 */
export function shouldChime(ev: GameEvent): boolean {
  if (ev.payload.muted) return false
  if (ev.type !== 'system' && ev.type !== 'notice' && ev.type !== 'game') return false
  return ev.scope === 'all' || ev.scope === 'role'
}
/** 이 간격 안에 연달아 뜨는 토스트는 소리를 한 번만 낸다 */
const CHIME_GAP = 600

export const useToastStore = defineStore('toasts', {
  state: () => ({
    items: [] as Toast[],
    duration: 5000,
    paused: false,
    /** 인트로 이미지가 덮고 있는 동안 (hover 의 paused 와 따로 둔다) */
    held: false,
    timer: null as ReturnType<typeof setInterval> | null,
    /** 역할상 알림음 대상인지 (presenter, member) */
    sound: false,
    /** 기기별 소리 끄기 (localStorage) */
    muted: isMuted(),
    lastChimeAt: 0,
  }),
  actions: {
    /** 역할에 따라 표시 시간을 정한다 (프레젠테이션은 빔 출력용이라 길게) */
    configure(role: string | undefined) {
      this.duration = role === 'presenter' ? 10000 : 5000
      this.sound = role === 'presenter' || role === 'member'
    },
    show(ev: GameEvent) {
      if (this.items.some((t) => t.id === ev.id)) return
      this.items.push({
        id: ev.id,
        label: scopeLabel(ev),
        message: eventMessage(ev),
        createdAt: ev.createdAt,
        remaining: this.duration,
        war: !!ev.payload.war,
      })
      if (this.items.length > MAX) this.items.splice(0, this.items.length - MAX)
      this.ensureTimer()
      if (shouldChime(ev)) this.chime()
    },
    /** 알림음. 대상 역할이고, 꺼 두지 않았고, 직전 소리에서 충분히 지났을 때만 */
    chime() {
      if (!this.sound || this.muted) return
      const now = Date.now()
      if (now - this.lastChimeAt < CHIME_GAP) return
      this.lastChimeAt = now
      void playChime()
    },
    setMuted(v: boolean) {
      this.muted = v
      setMuted(v)
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
    setHeld(v: boolean) {
      this.held = v
    },
    ensureTimer() {
      if (this.timer) return
      this.timer = setInterval(() => {
        if (this.paused || this.held) return
        // 가장 최근 알림은 닫기 전까지 유지 (docs/103 §6)
        const last = this.items[this.items.length - 1]
        for (const t of this.items) if (t !== last) t.remaining -= TICK
        this.items = this.items.filter((t) => t.remaining > 0)
        // 남은 것이 sticky 하나뿐이면 더 셀 것이 없다 (다음 show 에서 다시 돈다)
        if (this.items.length <= 1 && this.timer) {
          clearInterval(this.timer)
          this.timer = null
        }
      }, TICK)
    },
  },
})
