<script setup lang="ts">
/** 게임 화면 아래 고정 줄. 룰북은 항상 있고, 왼쪽 슬롯에 그때 쓸 버튼이 온다 (리더의 전쟁 선포). 주요 버튼(FixedBottomCta)이 뜨면 그 뒤로 가려진다 */
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
onMounted(() => document.body.classList.add('has-dock'))
onBeforeUnmount(() => document.body.classList.remove('has-dock'))
</script>

<template>
  <div class="dock">
    <slot />
    <button class="lg" type="button" @click="router.push('/rules')">룰북</button>
  </div>
</template>

<style scoped>
.dock { position: fixed; left: 0; right: 0; bottom: 0; z-index: 790; display: flex; gap: 8px; max-width: 720px; margin: 0 auto; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(to top, var(--bg) 75%, transparent); }
.dock :deep(button) { flex: 1; }
</style>
