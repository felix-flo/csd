<script setup lang="ts">
/**
 * 하단 고정 CTA (TDS FixedBottomCTA, docs/108). 화면 아래에 큰 버튼 하나를 고정한다 — 한 화면 한 과제의 주요 동작.
 * 떠 있는 동안 body.has-cta 를 켜서 .page 아래 여백을 늘린다 (마지막 카드가 가려지지 않게).
 * 게임 화면에서는 rules 로 옆에 룰북 버튼을 함께 둔다. 한 화면에 하나만 쓴다. 설명이 필요하면 hint 로 버튼 위에 한 줄.
 * 휴대폰 키보드가 올라오면 키보드 바로 위로 따라 올라간다 (보이는 영역 높이 visualViewport 기준).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

defineProps<{ label: string; disabled?: boolean; busy?: boolean; hint?: string; danger?: boolean; rules?: boolean }>()
const emit = defineEmits<{ click: [] }>()
const router = useRouter()

const lift = ref(0)
function follow() {
  const v = window.visualViewport
  if (v) lift.value = Math.max(0, window.innerHeight - v.height - v.offsetTop)
}

onMounted(() => {
  document.body.classList.add('has-cta')
  follow()
  window.visualViewport?.addEventListener('resize', follow)
  window.visualViewport?.addEventListener('scroll', follow)
})
onBeforeUnmount(() => {
  document.body.classList.remove('has-cta')
  window.visualViewport?.removeEventListener('resize', follow)
  window.visualViewport?.removeEventListener('scroll', follow)
})
</script>

<template>
  <Teleport to="body">
    <div class="cta-bar" :style="lift ? { transform: `translateY(-${lift}px)` } : undefined">
      <p v-if="hint" class="hint">{{ hint }}</p>
      <div class="acts">
        <button class="xl" :class="{ danger }" type="button" :disabled="disabled || busy" :aria-busy="busy || undefined" @click="emit('click')">
          {{ busy ? '처리 중…' : label }}
        </button>
        <button v-if="rules" class="secondary xl" type="button" @click="router.push('/rules')">룰북</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cta-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--bg) 75%, transparent);
}
.cta-bar > * { max-width: 688px; margin-left: auto; margin-right: auto; }
.acts { display: flex; gap: 8px; }
.hint { margin: 0 0 8px; text-align: center; font-size: 0.87rem; color: var(--muted); }
</style>
