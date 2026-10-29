<script setup lang="ts">
/**
 * 스파이 카드 (docs/100 N4, 룰 05 "스파이 카드"). 본인에게만, 평소에는 숨김.
 * - 상단바 내 이름을 3번 연속 누르면 뜬다 (TopBar). 카드를 누르면 바로 숨고, 10초 뒤 저절로 숨는다
 * - intro: 게임 시작 때 1번 보여주는 무음 안내 (다시 보는 방법 포함). 기록·소리 없음
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { SPY_REWARD_MAX, SPY_REWARD_PER, type SpyStatus } from '../../../shared/game'

const props = defineProps<{ spy: SpyStatus; intro?: boolean }>()
const emit = defineEmits<{ close: [] }>()
let timer: ReturnType<typeof setTimeout> | null = null
onMounted(() => {
  timer = setTimeout(() => emit('close'), props.intro ? 20_000 : 10_000)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
</script>

<template>
  <div class="spy-backdrop" @click="emit('close')">
    <div class="spy-card" role="dialog" aria-label="스파이 카드">
      <p class="eyebrow">{{ intro ? '당신에게만 보이는 카드' : '스파이 카드' }}</p>
      <h2>🌙 당신은 스파이입니다</h2>
      <ul>
        <li>겉으로는 소속 팀원으로 행동</li>
        <li>목표: 탈락자를 많이 만들기</li>
        <li>탈락자 1명당 {{ won(SPY_REWARD_PER) }} (최대 {{ won(SPY_REWARD_MAX) }})</li>
        <li>본인이 탈락하면 전부 사라짐</li>
        <li>정체는 최종장 마지막에 공개</li>
      </ul>
      <p class="reward">
        <template v-if="spy.alive">지금까지 탈락자 <strong>{{ spy.eliminated }}</strong>명 · 적립 <strong>{{ won(spy.reward) }}</strong></template>
        <template v-else>탈락하여 적립금이 사라졌습니다</template>
      </p>
      <p v-if="intro" class="hint">상단의 <strong>내 이름을 3번 연속 누르면</strong> 이 카드를 다시 볼 수 있습니다.</p>
      <p class="close">누르면 닫힙니다</p>
    </div>
  </div>
</template>

<style scoped>
.spy-backdrop { position: fixed; inset: 0; z-index: 950; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(5, 7, 15, 0.6); }
.spy-card {
  width: 100%;
  max-width: 380px;
  padding: 22px 20px;
  border-radius: 14px;
  background: radial-gradient(ellipse at top, #1d2440 0%, #0b0e1a 80%);
  color: #f3e6c4;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(243, 230, 196, 0.25);
  cursor: pointer;
}
.eyebrow { margin: 0 0 4px; font-size: 0.75rem; letter-spacing: 0.15em; color: rgba(243, 230, 196, 0.6); }
h2 { margin: 0 0 12px; font-family: var(--font-display); font-size: 1.5rem; color: #f3e6c4; }
ul { margin: 0; padding-left: 1.1em; line-height: 1.8; font-size: 0.95rem; }
.reward { margin: 14px 0 0; padding-top: 12px; border-top: 1px solid rgba(243, 230, 196, 0.25); }
.reward strong { color: #f3d68c; font-size: 1.15rem; }
.hint { margin: 10px 0 0; font-size: 0.88rem; color: rgba(243, 230, 196, 0.85); }
.close { margin: 12px 0 0; font-size: 0.75rem; text-align: right; color: rgba(243, 230, 196, 0.5); }
</style>
