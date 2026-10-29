<script setup lang="ts">
/**
 * 테스트 모드 (탭 로그인, docs/101.테스트모드_탭로그인.md) 전환 (관리자).
 * 켜면 로그인 때 리프레시 쿠키를 심지 않아 탭마다 따로 로그인한다 — 한 기기에서 여러 계정으로 테스트할 때.
 * 게임 상태와 무관하게 언제든 바꿀 수 있고, 설정 저장과 별도로 바로 저장된다. 이미 로그인한 세션은 그대로 둔다.
 */
import { computed, ref } from 'vue'
import type { AdminGameView } from '../../../shared/game'
import { api } from '../lib/api'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const on = computed(() => game.admin?.settings.tabLogin ?? false)
const busy = ref(false)
const error = ref('')

async function toggle(e: Event) {
  const next = (e.target as HTMLInputElement).checked
  busy.value = true
  error.value = ''
  try {
    game.setAdmin(await api.put<AdminGameView>('/api/admin/game/tab-login', { on: next }))
  } catch (err) {
    error.value = `실패: ${(err as Error).message}`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <label class="row tab-login" :class="{ on }" style="gap: 6px">
    <input type="checkbox" :checked="on" :disabled="busy" @change="toggle" />
    🧪 테스트 모드 (탭 로그인)
    <span class="muted">— 리프레시 토큰을 쓰지 않아 탭마다 따로 로그인합니다. 실제 진행 전에 끄세요</span>
    <span v-if="error" class="error">{{ error }}</span>
  </label>
</template>

<style scoped>
.tab-login.on { color: var(--amber, #b7791f); font-weight: 600; }
.tab-login.on .muted { font-weight: 400; }
</style>
