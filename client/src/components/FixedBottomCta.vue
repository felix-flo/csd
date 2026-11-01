<script setup lang="ts">
/**
 * 하단 고정 CTA (TDS FixedBottomCTA, docs/108). 화면 아래에 큰 버튼 하나를 고정한다 — 한 화면 한 과제의 주요 동작.
 * 떠 있는 동안 body.has-cta 를 켜서 .page 아래 여백을 늘린다 (마지막 카드가 가려지지 않게).
 * 한 화면에 하나만 쓴다. 설명이 필요하면 hint 로 버튼 위에 한 줄.
 */
import { onBeforeUnmount, onMounted } from 'vue'

defineProps<{ label: string; disabled?: boolean; busy?: boolean; hint?: string; danger?: boolean }>()
const emit = defineEmits<{ click: [] }>()

onMounted(() => document.body.classList.add('has-cta'))
onBeforeUnmount(() => document.body.classList.remove('has-cta'))
</script>

<template>
  <Teleport to="body">
    <div class="cta-bar">
      <p v-if="hint" class="hint">{{ hint }}</p>
      <button class="xl" :class="{ danger }" type="button" :disabled="disabled || busy" :aria-busy="busy || undefined" @click="emit('click')">
        {{ busy ? '처리 중…' : label }}
      </button>
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
  background: linear-gradient(to top, var(--bg) 75%, rgba(242, 244, 246, 0));
}
.cta-bar > * { max-width: 688px; margin-left: auto; margin-right: auto; }
.cta-bar button { display: block; }
.hint { margin: 0 0 8px; text-align: center; font-size: 0.87rem; color: var(--muted); }
</style>
