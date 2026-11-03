/** 영상·음악 소리 크기를 ms 동안 부드럽게 바꾼다 */
export function fadeVolume(el: HTMLMediaElement, to: number, ms: number) {
  const from = el.volume
  const start = performance.now()
  const timer = setInterval(() => {
    const p = Math.min((performance.now() - start) / ms, 1)
    el.volume = from + (to - from) * p
    if (p === 1) clearInterval(timer)
  }, 50)
}
