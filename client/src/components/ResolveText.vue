<script setup lang="ts">
/**
 * 리졸브(디코딩) 효과 텍스트: play 값이 바뀌면 글자들이 무작위 글자로 뒤섞이다가 앞에서부터 하나씩 제자리를 찾는다.
 * 프레젠테이션 제목 공개용 (게임 시작 순간). 공백·문장부호는 섞지 않는다. 동작 줄이기 설정(prefers-reduced-motion)이면 바로 표시
 */
import { onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ text: string; play?: number; duration?: number }>(), { play: 0, duration: 2400 })
const emit = defineEmits<{ done: [] }>()
const shown = ref(props.text)
let raf = 0

// 섞일 때 보여 줄 글자: 자주 쓰는 한글 음절 + 영문·숫자·기호
const POOL = '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호구누두루무부수우주추쿠투푸후ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+=<>?/'
const KEEP = /[\s:.,!?·\-]/
const randomChar = () => POOL[Math.floor(Math.random() * POOL.length)]!

function run() {
  cancelAnimationFrame(raf)
  const target = [...props.text]
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    shown.value = props.text
    emit('done')
    return
  }
  // 글자마다 제자리를 찾는 시각: 앞에서부터 순서대로 + 약간의 흔들림
  const settleAt = target.map((_, i) => (props.duration * 0.25) + (i / Math.max(1, target.length - 1)) * props.duration * 0.7 + Math.random() * 120)
  // 첫 프레임 전에 원래 글자가 한 번이라도 보이지 않도록 바로 섞어 둔다
  shown.value = target.map((ch) => (KEEP.test(ch) ? ch : randomChar())).join('')
  const start = performance.now()
  let lastSwap = start
  const tick = (now: number) => {
    const t = now - start
    // 섞인 글자는 60ms 마다만 바꿔서 읽을 틈이 있게
    if (now - lastSwap >= 60 || t >= props.duration) {
      lastSwap = now
      shown.value = target.map((ch, i) => (KEEP.test(ch) || t >= settleAt[i]! ? ch : randomChar())).join('')
    }
    if (t < props.duration + 150) raf = requestAnimationFrame(tick)
    else {
      raf = 0
      shown.value = props.text
      emit('done')
    }
  }
  raf = requestAnimationFrame(tick)
}

watch(() => props.play, (v, old) => {
  if (v !== old && v > 0) run()
})
watch(() => props.text, (v) => {
  // 효과 중이 아니면 바로 바꾼다
  if (!raf) shown.value = v
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <span class="resolve" :aria-label="text">{{ shown }}</span>
</template>

<style scoped>
.resolve { font-variant-numeric: tabular-nums; }
</style>
