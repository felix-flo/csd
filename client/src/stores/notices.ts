/**
 * 알림. 자동으로 사라지는 알림은 없다.
 * - 참가자·관리자: 가장 최근 알림 하나(latest)를 화면 위에 고정한다 (NoticeBar). 다음 알림이 오면 밀려나고, 지난 알림은 알림 화면에서 본다.
 * - 프레젠테이션: 알림을 전체 화면으로 하나씩 띄운다 (queue). 화면을 눌러야 다음으로 넘어간다.
 * - 어떤 이벤트를 알릴지는 realtime 스토어가 결정한다.
 * - 알림음(lib/chime.ts): 프레젠테이션·참가자만 듣고 관리자는 듣지 않는다.
 *   전체 범위 공지·시스템 알림만 울리고, 팀·개인 알림은 소리 없다. 기기별로 끌 수 있다(muted).
 */
import { defineStore } from 'pinia'
import type { GameEvent } from '../../../shared/types'
import type { Phase } from '../../../shared/game'
import { eventMessage, scopeLabel } from '../lib/eventLabel'
import { isMuted, playChime, setMuted } from '../lib/chime'

export interface Notice {
  id: number
  label: string
  message: string
  /** 전쟁 알림: 빨간 강조 */
  war: boolean
  /** 눌렀을 때 갈 곳. 없으면 알림 화면 */
  link: string | null
}

/** 프레젠테이션 전체 화면 하나 */
export type Overlay =
  | { type: 'phase'; phase: Phase }
  | { type: 'leaders' }
  | { type: 'notice'; message: string; auto?: boolean }

/** 프레젠테이션이 다른 화면으로 보여 주는 알림: 단계 공지, 리더 공개, 전쟁 선포·종료, 완료 문구, 최종장 단계(FinalStage) */
const SHOWN_ELSEWHERE = new Set([
  'game.updated', 'election.all_done', 'war.declared', 'war.resolved', 'life.all_done',
  'final.started', 'final.closed', 'final.tiebreak', 'final.result', 'final.settled', 'final.spy', 'final.ended',
])
/** 단계가 바뀌었다는 알림. 받으면 떠 있던 공지를 모두 지운다 (서버가 단계 알림을 그 단계의 공지보다 먼저 보낸다) */
export function isStageChange(ev: GameEvent): boolean {
  const kind = ev.payload.kind
  return (kind === 'game.updated' && ev.payload.phase != null) || (typeof kind === 'string' && kind.startsWith('final.') && SHOWN_ELSEWHERE.has(kind))
}

/** 프레젠테이션 공지 중 클릭 없이 저절로 닫히는 것 */
const AUTO_CLOSE = new Set(['migration.opened', 'migration.accepted', 'round.last', 'life.eliminated'])

/**
 * 소리를 낼 이벤트인지.
 * - 전체 공지·전체 시스템 알림·전체 게임 알림: scope 'all', 또는 역할 전체('role')
 * - 그 외(팀 공지·팀 이동/탈락 알림·거래 알림, 개인 알림)는 소리 없음. payload.muted (보석·골드 발행 알림)도 소리 없음.
 */
export function shouldChime(ev: GameEvent): boolean {
  if (ev.payload.muted) return false
  if (ev.type !== 'system' && ev.type !== 'notice' && ev.type !== 'game') return false
  return ev.scope === 'all' || ev.scope === 'role'
}
/** 전쟁 선포 소리 (data/media). 결과가 나오면 멈춘다 */
const warSound = new Audio('/media/war_siren.m4a?v=2')
function stopSiren() {
  warSound.pause()
  warSound.currentTime = 0
}
/** 이 간격 안에 연달아 오는 알림은 소리를 한 번만 낸다 */
const CHIME_GAP = 600

function toNotice(ev: GameEvent): Notice {
  return {
    id: ev.id,
    label: scopeLabel(ev),
    message: eventMessage(ev),
    war: !!ev.payload.war,
    link: ev.type === 'document.updated' ? '/rules' : null,
  }
}

export const useNoticeStore = defineStore('notices', {
  state: () => ({
    latest: null as Notice | null,
    queue: [] as Overlay[],
    presenter: false,
    /** 관리자: 남에게 간 개인 알림(라이프 투표권 당첨 등)은 상태판 알림 줄에 띄우지 않는다 */
    admin: false,
    /** 역할상 알림음 대상인지 (presenter, member) */
    sound: false,
    /** 기기별 소리 끄기 (localStorage) */
    muted: isMuted(),
    lastChimeAt: 0,
  }),
  actions: {
    configure(role: string | undefined) {
      this.presenter = role === 'presenter'
      this.admin = role === 'admin'
      this.sound = role === 'presenter' || role === 'member'
    },
    show(ev: GameEvent) {
      if (this.admin && ev.scope === 'user') return
      this.latest = toNotice(ev)
      if (this.presenter) this.toOverlay(ev)
      if (ev.payload.kind === 'war.declared') this.siren()
      else if (shouldChime(ev)) this.chime()
      if (ev.payload.kind === 'war.resolved') stopSiren()
    },
    /** 새로고침 뒤 지난 알림 복원. 소리·전체 화면 없이 고정 자리만 채운다 */
    restore(ev: GameEvent) {
      if (this.admin && ev.scope === 'user') return
      if (!this.latest) this.latest = toNotice(ev)
    },
    toOverlay(ev: GameEvent) {
      const kind = ev.payload.kind
      if (kind === 'war.declared') this.clearStage()
      if (isStageChange(ev)) this.queue = []
      if (ev.type === 'document.updated' || (typeof kind === 'string' && SHOWN_ELSEWHERE.has(kind))) return
      this.enqueue({ type: 'notice', message: eventMessage(ev), auto: AUTO_CLOSE.has(String(kind)) })
    },
    /** 새 공지가 뜨면 이전 공지는 사라진다 (한 번에 하나만) */
    enqueue(o: Overlay) {
      this.queue = [o]
    },
    /** 상태가 새 단계로 바뀌면 지난 단계 공지와 리더 공개를 비킨다 (공지는 단계 알림을 받을 때 이미 지웠다) */
    clearStage() {
      this.queue = this.queue.filter((q) => q.type !== 'phase' && q.type !== 'leaders')
    },
    next() {
      this.queue.shift()
    },
    /** 알림음. 대상 역할이고, 꺼 두지 않았고, 직전 소리에서 충분히 지났을 때만 */
    chime() {
      if (!this.sound || this.muted) return
      const now = Date.now()
      if (now - this.lastChimeAt < CHIME_GAP) return
      this.lastChimeAt = now
      void playChime()
    },
    /** 전쟁 선포 소리. 알림음을 끈 기기에서는 울리지 않는다 */
    siren() {
      if (!this.sound || this.muted) return
      warSound.currentTime = 0
      void warSound.play().catch(() => { /* 파일이 없거나 소리가 막히면 소리 없이 진행 */ })
    },
    setMuted(v: boolean) {
      this.muted = v
      setMuted(v)
    },
    clear() {
      this.latest = null
      this.queue = []
    },
  },
})
