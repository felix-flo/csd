<script setup lang="ts">
/**
 * 게임 시작 인트로 (참가자 화면). 대기 화면에서 시작 신호를 실시간으로 받았을 때만 GroupView 가 띄운다.
 * 2초 서서히 나타남 → 5초 유지 → "화면을 터치해주세요" 표시 → 터치하면 1초 서서히 사라짐. 안내가 뜨기 전 터치는 무시한다.
 * 토스트보다 위에 덮고, 덮는 동안 토스트 시간을 멈춘다(시작 알림은 이미지가 사라진 뒤 보인다. 소리는 시작 순간 그대로).
 * 세로 화면은 꽉 채우고(양옆 사람들만 잘림), 가로 화면은 이미지 전체를 보인다.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useToastStore } from '../stores/toasts'
import introUrl from '../assets/intro_image.webp'

const FADE_IN = 2000
const HOLD = 5000

const emit = defineEmits<{ done: [] }>()
const toasts = useToastStore()
/** in: 나타나는 중·유지, wait: 터치 안내, out: 사라지는 중 */
const stage = ref<'in' | 'wait' | 'out'>('in')
let timer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  toasts.setHeld(true)
  timer = setTimeout(() => (stage.value = 'wait'), FADE_IN + HOLD)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
  toasts.setHeld(false)
})

function touch() {
  if (stage.value === 'wait') stage.value = 'out'
}
// 안내 문구의 깜빡임 애니메이션도 올라오므로 오버레이 자신의 사라짐만 본다
function onAnimationEnd(e: AnimationEvent) {
  if (e.target === e.currentTarget && stage.value === 'out') emit('done')
}
</script>

<template>
  <Teleport to="body">
    <div class="intro" :class="stage" role="button" aria-label="화면을 터치해주세요" @click="touch" @animationend="onAnimationEnd">
      <img :src="introUrl" alt="" />
      <p v-if="stage === 'wait'" class="hint">화면을 터치해주세요</p>
    </div>
  </Teleport>
</template>

<style scoped>
.intro {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: #ececec;
  opacity: 0;
  animation: intro-in 2s ease-in-out forwards;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.intro.wait { cursor: pointer; }
.intro.out { opacity: 1; animation: intro-out 1s ease-in-out forwards; }
.intro img { width: 100%; height: 100%; object-fit: cover; display: block; }
@media (orientation: landscape) {
  .intro img { object-fit: contain; }
}
.hint {
  position: absolute;
  left: 50%;
  bottom: max(48px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  margin: 0;
  padding: 12px 24px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 1.1rem;
  font-weight: 700;
  white-space: nowrap;
  animation: intro-in 0.6s ease-out, hint-pulse 1.6s ease-in-out 0.6s infinite;
}
@keyframes intro-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes intro-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes hint-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
</style>
