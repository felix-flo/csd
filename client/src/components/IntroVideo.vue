<script setup lang="ts">
/**
 * 오프닝 영상 (프레젠테이션). 관리자가 게임을 시작하는 순간 전체 화면으로 틀고, 끝나면(또는 클릭·ESC 로 건너뛰면) done 을 올린다.
 * 소리: 브라우저 자동재생 정책 때문에 이 탭에서 한 번이라도 클릭·키 입력이 있어야 소리가 난다. 입력이 없었던 탭이면 소리 없이 재생한다.
 * 파일은 서버 data/media/intro.mp4 (GET /api/game/intro 로 유무 확인). 없으면 아무것도 그리지 않는다.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ src: string | null; play: number }>()
const emit = defineEmits<{ done: [] }>()
const video = ref<HTMLVideoElement | null>(null)
const showing = ref(false)
const muted = ref(false)

function finish() {
  if (!showing.value) return
  showing.value = false
  const v = video.value
  if (v) { v.pause(); v.currentTime = 0 }
  emit('done')
}

async function start() {
  const v = video.value
  if (!props.src || !v) { emit('done'); return }
  showing.value = true
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

watch(() => props.play, (n, o) => { if (n > (o ?? 0)) void start() })

function onKey(e: KeyboardEvent) {
  if (showing.value && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); finish() }
}
/** 소리 없이 재생 중일 때 클릭하면 소리를 켠다 (클릭 = 사용자 입력이라 허용됨). 그다음 클릭은 건너뛰기 */
function onClick() {
  const v = video.value
  if (muted.value && v) { v.muted = false; muted.value = false; return }
  finish()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="src" v-show="showing" class="intro" @click="onClick">
    <video ref="video" :src="src" preload="auto" playsinline @ended="finish" @error="finish" />
    <p class="hint">{{ muted ? '🔇 소리 없이 재생 중 · 클릭하면 소리 켜기' : '클릭 또는 ESC 로 건너뛰기' }}</p>
  </div>
</template>

<style scoped>
.intro { position: fixed; inset: 0; z-index: 1100; /* 토스트(1000) 위 */ background: #000; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.intro video { width: 100%; height: 100%; object-fit: contain; }
.hint { position: absolute; right: 20px; bottom: 16px; margin: 0; color: rgba(255, 255, 255, 0.55); font-size: 0.9rem; }
</style>
