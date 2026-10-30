<script setup lang="ts">
/**
 * 테러리스트 카드 (docs/100 N4, 룰 05 "테러리스트 카드"). 본인에게만, 평소에는 숨김.
 * - 룰 화면(RulesView)과 같은 틀: 흰 바탕 전체 화면 · 제목 "룰"(아래 작은 글씨 "당신에게만 보이는 화면") + 돌아가기 · 헤어라인 카드 한 장 · 본문은 MarkdownView (2026-10-30).
 *   옆에서 봐도 룰 보는 화면처럼 보이게 제목·구성을 룰 화면과 맞춘다
 * - 상단바 내 이름을 3번 연속 누르면 뜬다 (TopBar). 화면 아무 곳이나 누르거나 "돌아가기" 로 닫히고, 10초 뒤 저절로 닫힌다
 * - intro: 게임 시작 때 1번 보여주는 무음 안내 (다시 보는 방법 포함). 기록·소리 없음
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { SPY_REWARD_MAX, SPY_REWARD_PER, type SpyStatus } from '../../../shared/game'
import MarkdownView from './MarkdownView.vue'

const props = defineProps<{ spy: SpyStatus; intro?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const AUTO_CLOSE_MS = 10_000
let timer: ReturnType<typeof setTimeout> | null = null
onMounted(() => {
  timer = setTimeout(() => emit('close'), AUTO_CLOSE_MS)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

/** 룰 문서와 같은 마크다운으로 본문을 만든다 (MarkdownView 가 정화해서 그린다) */
const markdown = computed(() => {
  const s = props.spy
  const reward = s.alive
    ? `지금까지 탈락자 **${s.eliminated}**명 · 적립 **${won(s.reward)}**`
    : '탈락하여 적립금이 사라졌습니다'
  const lines = [
    '## 당신은 테러리스트입니다',
    '',
    '- 겉으로는 소속 팀원으로 행동합니다.',
    '- 목표: **탈락자를 많이 만들기**',
    `- 탈락자 1명당 \`${won(SPY_REWARD_PER)}\` (최대 \`${won(SPY_REWARD_MAX)}\`)`,
    '- 본인이 탈락하면 적립금은 전부 사라집니다.',
    '- 정체는 최종장 마지막에 공개됩니다.',
    '',
    '---',
    '',
    reward,
  ]
  if (props.intro) lines.push('', '> 상단의 **내 이름을 3번 연속 누르면** 이 화면을 다시 볼 수 있습니다.')
  return lines.join('\n')
})
</script>

<template>
  <div class="spy-page" role="dialog" aria-modal="true" aria-label="테러리스트 카드" @click="emit('close')">
    <div class="page">
      <div class="topbar">
        <div>
          <h1 style="margin: 0">룰</h1>
          <span class="muted">당신에게만 보이는 화면</span>
        </div>
        <div class="row">
          <button class="secondary" type="button" @click.stop="emit('close')">돌아가기</button>
        </div>
      </div>
      <div class="card">
        <MarkdownView :markdown="markdown" />
        <p class="muted" style="margin-top: 16px">화면을 누르면 닫힙니다 · 10초 뒤 저절로 닫힙니다</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 룰 화면과 같은 바탕. .page/.topbar/.card/button 은 전역 스타일 그대로 */
.spy-page {
  position: fixed;
  inset: 0;
  z-index: 950;
  background: var(--bg);
  color: var(--ink);
  overflow-y: auto;
  cursor: pointer;
}
</style>
