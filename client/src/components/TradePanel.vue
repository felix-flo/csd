<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 거래 (거래 단계, docs/103 §10). 거래는 오프라인에서 협의하고 진행자 앞에서 진행한다.
 * 진행자가 내용을 입력하고 확인하면 바로 크레딧(내는 팀) 1개 차감 + 재화 교환 → 두 팀에 완료 알림.
 * 2026-11-02: 두 리더 수락 단계를 없앴다. 이 카드는 안내만 한다.
 */
import { computed } from 'vue'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const warActive = computed(() => !!game.state?.war?.active)
</script>

<template>
  <div class="card">
    <h2><Icon name="aid" /> 거래</h2>
    <p v-if="warActive" class="war-block"><Icon name="war" /> 전쟁 중에는 거래할 수 없어요. 진행자가 결과를 정하면 다시 거래할 수 있어요.</p>
    <p v-else class="muted">거래는 오프라인에서 협의한 뒤 <strong>진행자에게 가서</strong> 진행해요. 진행자가 확인하면 바로 체결되고 알림이 와요.</p>
  </div>
</template>

<style scoped>
.war-block { color: var(--red); font-weight: 600; margin: 0; }
</style>
