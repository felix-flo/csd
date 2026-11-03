/**
 * 휴대폰 진동. 안드로이드 크롬 등 navigator.vibrate 가 있는 브라우저에서만 울리고,
 * 아이폰 사파리처럼 없는 곳에서는 조용히 넘어간다. 페이지를 한 번 이상 누른 뒤에만 울린다 (브라우저 정책)
 */
import { COUNT_DURATION } from './chime'

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch { /* 지원하지 않는 기기 */ }
}

/**
 * 숫자가 굴러가는 동안 "드드드득" 여러 번. 효과음(playCount)과 같은 박자로 처음엔 촘촘하고 끝으로 갈수록 느려진다.
 * 늘면 짧게, 줄면 조금 길게 떤다
 */
export function vibrateCount(up: boolean) {
  const pulses = 8
  const len = up ? 30 : 60
  const at = Array.from({ length: pulses }, (_, i) => COUNT_DURATION * (1 - (1 - i / (pulses - 1)) ** (1 / 3)))
  const pattern: number[] = []
  at.forEach((t, i) => {
    if (i > 0) pattern.push(Math.max(40, t - at[i - 1]! - len))
    pattern.push(len)
  })
  vibrate(pattern)
}
