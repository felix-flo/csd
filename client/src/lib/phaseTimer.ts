import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PHASE_LABELS } from '../../../shared/game'
import { useGameStore } from '../stores/game'

/** 단계 타이머 (docs/103 §14): 거래 15분 · 리더 협의 5분. 서버 시각으로 보정한 카운트다운 */
export function usePhaseTimer() {
  const game = useGameStore()
  const s = computed(() => game.state)
  const nowTick = ref(Date.now())
  let tickHandle: ReturnType<typeof setInterval> | null = null
  onMounted(() => { tickHandle = setInterval(() => (nowTick.value = Date.now()), 500) })
  onBeforeUnmount(() => { if (tickHandle) clearInterval(tickHandle) })
  /** 서버 시각 − 내 시계 (상태를 받을 때마다 갱신) */
  const clockOffset = ref(0)
  watch(() => s.value?.timer?.serverNow, (now) => { if (now) clockOffset.value = new Date(now).getTime() - Date.now() }, { immediate: true })
  return computed(() => {
    const t = s.value?.timer
    if (!t || s.value?.status !== 'running') return null
    const left = Math.max(0, Math.round((new Date(t.endsAt).getTime() - (nowTick.value + clockOffset.value)) / 1000))
    const mm = String(Math.floor(left / 60)).padStart(2, '0')
    const ss = String(left % 60).padStart(2, '0')
    return { phase: t.phase, label: PHASE_LABELS[t.phase], text: `${mm}:${ss}`, left, over: left === 0, warn: left > 0 && left <= 60, ratio: left / t.seconds }
  })
}
