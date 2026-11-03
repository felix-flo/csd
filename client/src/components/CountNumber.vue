<script setup lang="ts">
/**
 * 바뀌는 숫자. 값이 바뀌면 이전 값에서 새 값까지 굴러가듯 세고, 늘면 초록·줄면 빨강으로 잠깐 강조하며
 * 옆에 +N / −N 이 떠올랐다 사라진다. 처음 그릴 때와 값이 없다가 생길 때는 그냥 보여 준다.
 * 움직임 줄이기 설정이면 세지 않고 바로 바꾼다 (강조색만 남김)
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { COUNT_DURATION } from '../lib/chime'

const props = defineProps<{ value?: number | null }>()

const DURATION = COUNT_DURATION
const shown = ref<number | null>(props.value ?? null)
const delta = ref(0)
/** 같은 방향으로 연달아 바뀌어도 애니메이션을 다시 시작하도록 key 를 올린다 */
const pulse = ref(0)
let frame = 0

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const fmt = (n: number | null) => (n == null ? '–' : n.toLocaleString('ko-KR'))

watch(
  () => props.value,
  (now, before) => {
    cancelAnimationFrame(frame)
    if (now == null || before == null || now === before) {
      shown.value = now ?? null
      return
    }
    delta.value = now - before
    pulse.value++
    if (reduced()) {
      shown.value = now
      return
    }
    const from = shown.value ?? before
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / DURATION)
      const eased = 1 - (1 - p) ** 3
      shown.value = Math.round(from + (now - from) * eased)
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  },
)
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <span class="count-num">
    <span :key="pulse" class="n" :class="pulse ? (delta > 0 ? 'up' : 'down') : ''">{{ fmt(shown) }}</span>
    <span v-if="pulse" :key="`d${pulse}`" class="delta" :class="delta > 0 ? 'up' : 'down'">{{ delta > 0 ? `+${delta}` : `−${-delta}` }}</span>
  </span>
</template>

<style scoped>
.count-num { position: relative; display: inline-block; font-variant-numeric: tabular-nums; }
.n { display: inline-block; }
.n.up { animation: hit-up 2.4s ease-out; }
.n.down { animation: hit-down 2.4s ease-out; }
/* +N / −N: 숫자 오른쪽 위에서 떠올랐다 사라진다 */
.delta {
  position: absolute; left: 100%; top: -0.1em; margin-left: 0.25em;
  font-size: 0.55em; font-weight: 700; white-space: nowrap; pointer-events: none;
  animation: float-off 2.8s ease-out both;
}
.delta.up { color: var(--green); }
.delta.down { color: var(--red); }
@keyframes hit-up {
  0% { transform: scale(1); color: inherit; }
  15% { transform: scale(1.18); color: var(--green); }
  60% { transform: scale(1); color: var(--green); }
  100% { color: inherit; }
}
@keyframes hit-down {
  0% { transform: translateX(0); color: inherit; }
  10% { transform: translateX(-3px); color: var(--red); }
  20% { transform: translateX(3px); }
  30% { transform: translateX(-2px); }
  40% { transform: translateX(0); }
  60% { color: var(--red); }
  100% { color: inherit; }
}
@keyframes float-off {
  0% { opacity: 0; transform: translateY(0.3em); }
  15% { opacity: 1; transform: translateY(0); }
  70% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-0.6em); }
}
@media (prefers-reduced-motion: reduce) {
  .n.up, .n.down { animation-name: none; }
  .delta { animation: float-off 2.8s step-end both; }
}
</style>
