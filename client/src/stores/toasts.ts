/**
 * 플로팅 알림(토스트). 공지(notice) 이벤트가 도착하면 화면 상단에 잠시 띄운다.
 * - 최대 3개 쌓인다. 기본 5초(프레젠테이션 10초) 뒤 자동으로 닫히고, 마우스를 올리면 멈춘다.
 *   참가자(member)는 NoticeHost 가 하나씩 보여 준다 (sticky, docs/107). 확인이 필요한 알림(needsConfirm)은 확인을 누를 때까지 남고, 나머지는 잠시 뒤 저절로 닫힌다. 프레젠테이션·관리자는 전부 자동으로 닫힌다.
 * - 어떤 이벤트를 띄울지는 realtime 스토어가 결정한다 (공지와 팀 이동/탈락 알림만. 본인이 만든 이벤트·룰 갱신은 제외).
 * - 알림음(lib/chime.ts): 프레젠테이션·참가자(리더/팀원)만 듣고 관리자는 듣지 않는다.
 *   울리는 경우는 shouldChime() 이 정한다 — 전체 범위 공지·시스템 알림만. 팀(이동·탈락·거래 등)·개인 알림은 팝업만 뜨고 소리는 없다.
 *   기기별로 끌 수 있다(muted). replay 로 여러 개가 한꺼번에 뜨면 한 번만 울린다.
 * - held: 시작 인트로 이미지(IntroOverlay)가 덮고 있는 동안은 시간이 줄지 않는다 → 이미지가 사라진 뒤 온전히 보인다.
 */
import { defineStore } from 'pinia'
import type { GameEvent } from '../../../shared/types'
import { isBeforeStart } from '../../../shared/game'
import { eventMessage, noticeLabel, scopeLabel } from '../lib/eventLabel'
import { isMuted, playChime, setMuted } from '../lib/chime'
import { useAuthStore } from './auth'
import { useGameStore } from './game'

export interface Toast {
  id: number
  label: string
  message: string
  createdAt: string
  /** 남은 시간(ms). 호버 중에는 줄지 않는다. 가장 최근 알림(sticky)은 줄지 않는다 */
  remaining: number
  /** 전쟁 알림: 빨간 강조 팝업 (payload.war) */
  war: boolean
  /** 이벤트 종류 (payload.kind). 참가자 화면은 war.declared 를 전체 화면으로 보여 준다 */
  kind: string
  /** 큰 제목·방향·설명으로 나눠 보여 줄 때 (payload.headline·route·detail). route 는 [보내는 팀 id, 받는 팀 id] */
  headline: string | null
  route: [number, number] | null
  detail: string | null
  /** 참가자 알림: 확인을 눌러야 닫힌다. 아니면 NoticeHost 가 잠시 보여 준 뒤 닫는다 */
  mustConfirm: boolean
}

function routeOf(ev: GameEvent): [number, number] | null {
  const r = ev.payload.route
  if (Array.isArray(r) && r.length === 2) return [Number(r[0]), Number(r[1])]
  if (ev.payload.kind === 'war.declared') return [Number(ev.payload.attacker), Number(ev.payload.defender)]
  return null
}

const MAX = 3
const TICK = 100
/** 진행 안내. 다음 단계가 시작되면 지난 안내를 확인할 필요가 없어 팝업에서 빼고 알림함에만 남긴다 (docs/107) */
const PROGRESS_KINDS = new Set(['game.updated', 'election.all_done', 'life.all_done', 'phase.timeout'])
/** 확인을 눌러야 닫히는 알림 (docs/107): 전쟁, 탈락, 내 이주, 리더 교체, 최종장의 시작과 결과 */
const CONFIRM_KINDS = new Set([
  'war.declared', 'war.resolved', 'war.spoils', 'war.lost',
  'life.submitted', 'life.eliminated', 'members.active',
  'migration.requested', 'migration.rejected', 'migration.cancelled',
  'leader.set',
  'final.started', 'final.result', 'final.settled', 'final.spy',
])

function needsConfirm(ev: GameEvent): boolean {
  // 진행자 공지와 룰 갱신은 드물고 놓치면 안 된다
  if (ev.type === 'notice' || ev.type === 'document.updated') return true
  // 거래 제안은 수락할 리더만 확인한다
  if (ev.payload.kind === 'trade.proposed') return !!useAuthStore().user?.isLeader
  return CONFIRM_KINDS.has(String(ev.payload.kind))
}

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
    /** 가장 최근 알림을 닫기 전까지 유지할지 (참가자만) */
    sticky: false,
    /** 기기별 소리 끄기 (localStorage) */
    muted: isMuted(),
    lastChimeAt: 0,
  }),
  actions: {
    /** 역할에 따라 표시 시간을 정한다 (프레젠테이션은 빔 출력용이라 길게) */
    configure(role: string | undefined) {
      this.duration = role === 'presenter' ? 10000 : 5000
      this.sound = role === 'presenter' || role === 'member'
      this.sticky = role === 'member'
    },
    show(ev: GameEvent) {
      if (this.items.some((t) => t.id === ev.id)) return
      if (this.sticky && ev.payload.kind === 'game.updated') this.items = this.items.filter((t) => !PROGRESS_KINDS.has(t.kind))
      const gameState = useGameStore().state
      this.items.push({
        id: ev.id,
        label: this.sticky ? noticeLabel(ev, !gameState || isBeforeStart(gameState.status)) : scopeLabel(ev),
        message: eventMessage(ev),
        createdAt: ev.createdAt,
        remaining: this.duration,
        war: !!ev.payload.war,
        kind: typeof ev.payload.kind === 'string' ? ev.payload.kind : '',
        headline: typeof ev.payload.headline === 'string' ? ev.payload.headline : null,
        route: routeOf(ev),
        detail: typeof ev.payload.detail === 'string' ? ev.payload.detail : null,
        mustConfirm: this.sticky && needsConfirm(ev),
      })
      // 넘치면 저절로 닫히는 알림만 오래된 것부터 뺀다. 확인이 필요한 알림과 참가자가 보고 있는 맨 앞 알림은 남긴다
      const passing = this.items.slice(this.sticky ? 1 : 0).filter((t) => !t.mustConfirm)
      if (passing.length > MAX) {
        const gone = new Set(passing.slice(0, passing.length - MAX).map((t) => t.id))
        this.items = this.items.filter((t) => !gone.has(t.id))
      }
      // 참가자 알림의 표시 시간은 NoticeHost 가 센다 (docs/107)
      if (!this.sticky) this.ensureTimer()
      if (shouldChime(ev)) this.chime()
    },
    /** 재접속 때 밀린 알림. 최근 3건만 팝업하고 나머지는 알림함에서 확인한다. 참가자는 확인이 필요한 알림을 먼저 고른다 */
    showMissed(evs: GameEvent[]) {
      const must = this.sticky ? evs.filter(needsConfirm) : []
      for (const ev of (must.length ? must : evs).slice(-MAX)) this.show(ev)
    },
    /** 이벤트가 아닌 화면 자체 안내 (참가자). 알림함에 남지 않고, 맨 앞에서 확인을 기다린다 */
    showLocal(kind: string, headline: string, detail: string) {
      this.items.unshift({ id: -Date.now(), label: '개인 알림', message: headline, createdAt: '', remaining: 0, war: false, kind, headline, route: null, detail, mustConfirm: true })
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
        for (const t of this.items) t.remaining -= TICK
        this.items = this.items.filter((t) => t.remaining > 0)
        // 더 셀 것이 없으면 멈춘다 (다음 show 에서 다시 돈다)
        if (this.items.length === 0 && this.timer) {
          clearInterval(this.timer)
          this.timer = null
        }
      }, TICK)
    },
  },
})
