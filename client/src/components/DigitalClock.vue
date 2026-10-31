<script setup lang="ts">
/** 7세그먼트 디지털 시계. text 는 "MM:SS" */
import { computed } from 'vue'

const props = defineProps<{ text: string; label?: string }>()

const SEG: Record<string, string> = {
  a: 'M2.5 2 4 .5h6L11.5 2 10 3.5H4z',
  b: 'M12 2.5 13.5 4v6L12 11.5 10.5 10V4z',
  c: 'M12 12.5 13.5 14v6L12 21.5 10.5 20V14z',
  d: 'M2.5 22 4 20.5h6l1.5 1.5-1.5 1.5H4z',
  e: 'M2 12.5 3.5 14v6L2 21.5.5 20V14z',
  f: 'M2 2.5 3.5 4v6L2 11.5.5 10V4z',
  g: 'M2.5 12 4 10.5h6l1.5 1.5-1.5 1.5H4z',
}
const DIGITS: Record<string, string> = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgecd', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' }
const X = [0, 16, 38, 54]

const digits = computed(() =>
  props.text.replace(':', '').split('').slice(0, 4).map((ch, i) => ({
    x: X[i],
    d: [...(DIGITS[ch] ?? '')].map((s) => SEG[s]).join(''),
  })),
)
</script>

<template>
  <svg class="clock" viewBox="0 0 68 24" role="img" :aria-label="label ?? `남은 시간 ${text}`">
    <path v-for="n in digits" :key="n.x" :transform="`translate(${n.x})`" :d="n.d" />
    <path d="M32 7h3v3h-3zM32 14h3v3h-3z" />
  </svg>
</template>

<style scoped>
.clock { display: block; flex: none; height: 22px; width: 62px; fill: var(--led, #fff); filter: drop-shadow(0 0 3px color-mix(in srgb, var(--led, #fff) 70%, transparent)); }
</style>
