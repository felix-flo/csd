<script setup lang="ts">
/** 오프닝 때 참가자 화면. 영상 중에는 앞을 보게 하고, 그 뒤에는 내 팀을 보여 준다. 점심시간에는 팀원 명단까지 */
import { computed } from 'vue'
import type { OpeningStep, Resources } from '../../../shared/game'
import Crest from './Crest.vue'
import TeamStock from './TeamStock.vue'
import TeamRoster from './TeamRoster.vue'

const props = defineProps<{ step: OpeningStep; code?: string; team?: string; resources?: Resources; members: { id: number; name: string }[] }>()
const ROLE: Record<string, string> = { white: '보석을 발행합니다', yellow: '골드를 발행합니다', blue: '라이프를 가장 많이 만듭니다', red: '크레딧이 가장 많습니다' }
const role = computed(() => (props.code ? ROLE[props.code] ?? '' : ''))
</script>

<template>
  <div v-if="step === 'film'" class="front"><p>앞 화면을 봐 주세요</p></div>
  <div v-else class="mine">
    <Crest :team="code" size="112px" />
    <p class="kicker">{{ step === 'lunch' ? '점심시간' : '당신의 팀은' }}</p>
    <h1>{{ team?.replace(/ 팀$/, '') }}</h1>
    <p class="muted">{{ step === 'lunch' ? '팀별로 식사하며 전략을 세워 주세요.' : role }}</p>
    <TeamStock class="wide" :resources="resources" />
    <TeamRoster class="wide" :members="members" hide-leader />
  </div>
</template>

<style scoped>
.front { position: fixed; inset: 0; z-index: 1200; background: #000; color: #fff; display: grid; place-items: center; }
.front p { margin: 0; font-family: var(--font-display); font-size: 2.2rem; letter-spacing: -0.04em; }
.mine { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding-top: 16px; }
.kicker { margin: 12px 0 0; font-weight: 600; color: var(--muted); }
h1 { font-size: 3.6rem; }
.wide { width: 100%; margin: 12px 0 0; text-align: left; }
</style>
