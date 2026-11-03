<script setup lang="ts">
/**
 * 한 줄 글자. 칸에 다 들어가면 그대로 두고, 넘치면 왼쪽 끝 → 오른쪽 끝을 천천히 오가며 보여 준다 (자르지 않음).
 * 칸 크기나 글자가 바뀌면 다시 잰다. 움직임 줄이기 설정이면 오가지 않고 끝을 "…" 로 자른다
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const box = ref<HTMLElement>()
const inner = ref<HTMLElement>()
const shift = ref(0)

function measure() {
  if (!box.value || !inner.value) return
  const over = inner.value.scrollWidth - box.value.clientWidth
  shift.value = over > 1 ? Math.ceil(over) : 0
}

let ro: ResizeObserver | undefined
onMounted(() => {
  void nextTick(measure)
  ro = new ResizeObserver(measure)
  if (box.value) ro.observe(box.value)
  if (inner.value) ro.observe(inner.value)
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <span ref="box" class="marquee" :class="{ run: shift > 0 }">
    <span
      ref="inner"
      class="inner"
      :style="shift > 0 ? { '--shift': `-${shift}px`, '--dur': `${Math.max(4, shift / 25 + 3)}s` } : undefined"
    ><slot /></span>
  </span>
</template>

<style scoped>
.marquee { display: block; min-width: 0; overflow: hidden; white-space: nowrap; }
.inner { display: inline-block; }
.run { text-align: left; }
/* 양 끝에서 잠깐 멈췄다가 오간다 */
.run .inner { animation: marquee var(--dur) ease-in-out infinite alternate; }
@keyframes marquee {
  0%, 20% { transform: translateX(0); }
  80%, 100% { transform: translateX(var(--shift)); }
}
@media (prefers-reduced-motion: reduce) {
  .run .inner { animation: none; display: block; overflow: hidden; text-overflow: ellipsis; }
}
</style>
