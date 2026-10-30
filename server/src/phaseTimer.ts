/**
 * 단계 타이머 (docs/103 §14): 거래 15분 · 리더 협의 5분. 강제는 없고, 0 이 되면 전체에 "시간이 종료되었습니다" 알림을 1번 보낸다.
 * - 단계가 바뀔 때마다(시작·다음 단계·전쟁 뒤 자동 전환·리셋) schedulePhaseTimer() 를 불러 타이머를 다시 잡는다. 서버 기동 때도 한 번.
 * - 알림은 game.phase_timer_fired 로 1회를 보장한다 (서버가 재시작돼도 중복되지 않고, 이미 지난 타이머는 기동 때 바로 보낸다).
 */
import { getGameRow, getPhaseTimer, markPhaseTimerFired } from './db/game.js'
import { insertEvent } from './db/events.js'
import { publishEvent } from './realtime/index.js'
import { PHASE_TIMEOUT_MESSAGES } from '../../shared/game.js'

let handle: ReturnType<typeof setTimeout> | null = null

export function schedulePhaseTimer() {
  if (handle) { clearTimeout(handle); handle = null }
  const g = getGameRow()
  const t = getPhaseTimer(g)
  if (!t || t.fired) return
  const ms = Math.max(0, new Date(t.endsAt).getTime() - Date.now())
  const day = g.day
  handle = setTimeout(() => {
    handle = null
    if (!markPhaseTimerFired(day, t.phase)) return // 그사이 단계가 바뀌었거나 이미 보냄
    const message = PHASE_TIMEOUT_MESSAGES[t.phase] ?? '⏱️ 시간이 종료되었습니다.'
    publishEvent(insertEvent({ type: 'game', scope: 'all', targetId: null, payload: { kind: 'phase.timeout', message, day, phase: t.phase }, createdBy: null }))
  }, ms)
}
