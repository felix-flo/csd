<script setup lang="ts">
/** 우리 팀 재화 카드. 오프닝과 게임 화면이 같은 모양을 쓴다 */
import type { Resources } from '../../../shared/game'
import ResourceRow from './ResourceRow.vue'

defineProps<{ resources?: Resources }>()
</script>

<template>
  <div class="card stock"><ResourceRow grid :amounts="resources" /></div>
</template>

<style scoped>
.stock { padding: 0; }
</style>
