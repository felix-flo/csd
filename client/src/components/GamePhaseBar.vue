<script setup lang="ts">
/**
 * 게임 진행 표시줄. 모든 역할의 상단바 아래에 붙는다 (TopBar).
 * "2라운드 / 총 6라운드 · 거래 중" + 라운드 흐름 5단계 중 현재 위치. 준비 상태에서는 "게임 준비 중".
 * 최종장(docs/100 N2)은 "최종장 · 최종 투표" + 최종 투표 → 결과 발표 → 정산. "테러리스트 공개" 칩은 그 단계가 되기 전까지 숨긴다 (docs/103 §13: 테러리스트 존재를 미리 알리지 않게).
 */
import { computed } from 'vue'
import { useGameStore } from '../stores/game'
import { usePhaseTimer } from '../lib/phaseTimer'
import { FINAL_STEP_LABELS, phaseLabel, phasesOf, warStage } from '../../../shared/game'

defineProps<{ large?: boolean }>()
const game = useGameStore()
const timer = usePhaseTimer()
const s = computed(() => game.state)
/** 휴대폰 단계 칸에 들어가는 짧은 이름 */
const SHORT = { leader: '리더', production: '생산', trade: '거래', council: '협의', last_issue: '발행', life: '라이프' } as const
const phases = computed(() => phasesOf(s.value?.day ?? 0, s.value?.totalDays))
const warLabel = computed(() => {
  const war = warStage(s.value)
  return war ? (war === 'war' ? '전쟁 중' : '전쟁 종료') : null
})
const FINAL_FLOW = ['vote', 'result', 'settle', 'spy'] as const
const finalIdx = computed(() => FINAL_FLOW.indexOf((s.value?.final?.step ?? 'vote') as never))
/** 테러리스트 공개 단계 전에는 그 칩을 보여 주지 않는다 */
const finalFlow = computed(() => (s.value?.final?.step === 'spy' ? FINAL_FLOW : FINAL_FLOW.filter((st) => st !== 'spy')))
</script>

<template>
  <div v-if="s && s.status !== 'setup'" class="phase-bar" :class="{ large, ended: s.status === 'ended', ready: s.status === 'ready' }">
    <template v-if="s.status === 'running' && s.phase">
      <div class="now">
        <span class="day mono">{{ s.day }}라운드 <span class="muted">/ 총 {{ s.totalDays }}라운드</span></span>
        <strong>{{ warLabel ?? `${phaseLabel(s.phase, s.day)} 중` }}</strong>
        <span v-if="timer && !large" class="time mono" :class="{ warn: timer.warn, over: timer.over }" :title="timer.over ? '이 단계의 안내 시간이 지났습니다. 다음 단계로 넘기면 됩니다' : '이 단계의 안내 시간'">{{ timer.over ? '시간 끝' : timer.text }}</span>
      </div>
      <ol class="steps">
        <li v-for="(p, i) in phases" :key="p" :class="{ cur: p === s.phase, past: phases.indexOf(s.phase) > i }">
          {{ large ? phaseLabel(p, s.day) : SHORT[p] }}
        </li>
      </ol>
    </template>
    <div v-else-if="s.status === 'ready'" class="now"><strong>게임 준비 중</strong><span class="muted">참가자 입장·팀 선택</span></div>
    <template v-else-if="s.status === 'final' && s.final">
      <div class="now"><span class="day mono">최종장</span><strong>{{ FINAL_STEP_LABELS[s.final.step] }}</strong></div>
      <ol class="steps">
        <li v-for="(st, i) in finalFlow" :key="st" :class="{ cur: i === finalIdx, past: finalIdx > i }">{{ FINAL_STEP_LABELS[st] }}</li>
      </ol>
    </template>
    <div v-else class="now"><strong>게임 끝</strong><span class="muted">수고하셨습니다</span></div>
  </div>
</template>

<style scoped>
.phase-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 14px;
  margin-bottom: 12px;
  background: var(--surface);
  border: 0;
  border-radius: var(--radius-card);
  box-shadow: 0 0 0 1px var(--line-soft);
}
.phase-bar.ended, .phase-bar.ready { padding-bottom: 14px; }
.now { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; padding-bottom: 10px; width: 100%; }
.time { margin-left: auto; font-size: 1.2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.time.warn { color: var(--red); }
.time.over { font-size: 0.95rem; font-weight: 600; color: var(--muted); }
.now strong { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em; }
.day { font-size: 0.93rem; font-family: var(--font-body); color: var(--ink-2); font-variant-numeric: tabular-nums; }
/* TDS Tab: 글자 15px, 현재는 진한 글자 + 2px 밑줄, 나머지 회색. 선택 전까지 밑줄 자리는 비워 둔다 */
.steps { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; list-style: none; margin: 0; padding: 3px; width: 100%; background: var(--bg-soft); border-radius: 8px; }
.steps li {
  font-family: var(--font-body);
  font-size: 0.93rem;
  font-weight: 600;
  padding: 6px 2px;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  text-align: center;
  white-space: nowrap;
}
.steps li.past { color: #8d8a82; }
.steps li.cur { color: var(--ink); font-weight: 700; background: var(--surface); box-shadow: 0 1px 3px rgba(8, 8, 8, 0.14); }
/* 프레젠테이션: 루트 20px 기준이라 rem 값은 1.25배로 보인다 */
.large .now strong { font-family: var(--font-display); font-weight: 400; letter-spacing: -0.065em; line-height: 1.1; font-size: 5.6rem; }
.large .day { font-size: 1.3rem; }
.large .steps li { font-size: 1.2rem; padding: 10px 14px; }
.large .steps li.past { color: var(--muted); }
</style>
