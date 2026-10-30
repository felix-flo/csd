<script setup lang="ts">
/**
 * 오프닝 영상 (프레젠테이션). 관리자가 게임을 시작하는 순간 전체 화면으로 틀고, 끝나면(또는 건너뛰면) done 을 올린다.
 * 대기: 관리자가 다른 브라우저에서 시작을 누른 뒤 프레젠테이션 창으로 넘어올 시간이 필요하므로, 검정 대기 화면에 카운트다운(delay 초)을
 *       보여 준 뒤 재생한다. 대기 중 클릭·Space·Enter 는 즉시 시작 (이 클릭이 소리 허용 조건도 겸한다), ESC 는 영상 건너뛰기.
 *       delay 가 'wait' 면 카운트다운 없이 클릭할 때까지 기다린다. 0 이면 바로 튼다.
 * 소리: 브라우저 자동재생 정책 때문에 이 탭에서 한 번이라도 클릭·키 입력이 있어야 소리가 난다. 입력이 없었던 탭이면 소리 없이 재생한다.
 * 파일은 서버 data/media/intro.mp4 (GET /api/game/intro 로 유무 확인). 없으면 아무것도 그리지 않는다.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ src: string | null; play: number; delay?: number | 'wait' }>(), { delay: 10 })
const emit = defineEmits<{ done: [] }>()
const video = ref<HTMLVideoElement | null>(null)
const phase = ref<'idle' | 'standby' | 'playing'>('idle')
const muted = ref(false)
const countdown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function clearTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

function finish() {
  if (phase.value === 'idle') return
  clearTimer()
  phase.value = 'idle'
  const v = video.value
  if (v) { v.pause(); v.currentTime = 0 }
  emit('done')
}

/** 시작 신호: 대기 화면 → (카운트다운 또는 클릭) → 재생 */
function trigger() {
  if (!props.src || !video.value) { emit('done'); return }
  phase.value = 'standby'
  if (props.delay === 'wait') { countdown.value = 0; return }
  if (props.delay <= 0) { void startPlayback(); return }
  countdown.value = Math.ceil(props.delay)
  clearTimer()
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) { clearTimer(); void startPlayback() }
  }, 1000)
}

async function startPlayback() {
  const v = video.value
  if (!v || phase.value !== 'standby') return
  clearTimer()
  phase.value = 'playing'
  muted.value = false
  v.muted = false
  v.currentTime = 0
  try {
    await v.play()
  } catch {
    // 소리 자동재생이 막힌 탭 → 소리 없이라도 튼다
    v.muted = true
    muted.value = true
    try { await v.play() } catch { finish() }
  }
}

watch(() => props.play, (n, o) => { if (n > (o ?? 0)) trigger() })

function onKey(e: KeyboardEvent) {
  if (phase.value === 'idle') return
  if (e.key === 'Escape') { e.preventDefault(); finish(); return }
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    if (phase.value === 'standby') void startPlayback()
    else finish()
  }
}
/** 대기 중 클릭 = 즉시 시작. 재생 중: 소리 없이 재생 중이면 소리 켜기, 아니면 건너뛰기 */
function onClick() {
  if (phase.value === 'standby') { void startPlayback(); return }
  const v = video.value
  if (muted.value && v) { v.muted = false; muted.value = false; return }
  finish()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); clearTimer() })
</script>

<template>
  <div v-if="src" v-show="phase !== 'idle'" class="intro" @click="onClick">
    <video ref="video" :src="src" preload="auto" playsinline :class="{ hidden: phase !== 'playing' }" @ended="finish" @error="finish" />
    <div v-if="phase === 'standby'" class="standby">
      <p class="label">잠시 후 시작합니다</p>
      <p v-if="countdown > 0" class="count mono">{{ countdown }}</p>
      <p class="sub">클릭 또는 Space 로 바로 시작 · ESC 로 영상 건너뛰기</p>
    </div>
    <p v-else class="hint">{{ muted ? '🔇 소리 없이 재생 중 · 클릭하면 소리 켜기' : '클릭 또는 ESC 로 건너뛰기' }}</p>
  </div>
</template>

<style scoped>
.intro { position: fixed; inset: 0; z-index: 1100; /* 토스트(1000) 위 */ background: #000; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.intro video { width: 100%; height: 100%; object-fit: contain; }
.intro video.hidden { visibility: hidden; }
.standby { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #fff; text-align: center; }
.standby .label { margin: 0; font-family: var(--font-display); font-size: 2.6rem; opacity: 0.85; }
.standby .count { margin: 0; font-size: 7rem; line-height: 1; font-weight: 700; }
.standby .sub { margin: 16px 0 0; font-size: 1rem; opacity: 0.5; }
.hint { position: absolute; right: 20px; bottom: 16px; margin: 0; color: rgba(255, 255, 255, 0.55); font-size: 0.9rem; }
</style>
