<script setup lang="ts">
/**
 * 재화 영역 (docs/107): 2줄 2칸 (위 보석·골드, 아래 라이프·크레딧). 수량이 네 자리여도 들어가도록 좁은 숫자 폭을 쓴다.
 * 팀 기능(화이트 보석 발행, 옐로우 골드 발행)은 그 아래 전체 폭. 리더는 버튼, 팀원은 안내만 본다.
 */
import { computed } from 'vue'
import Icon from './Icon.vue'
import { PHASE_LABELS, RESOURCE_LABELS, type Resources, type TeamIssueView } from '../../../shared/game'
import { RESOURCES } from '../lib/resources'

const props = defineProps<{ resources: Resources | null; issue: TeamIssueView | null; isLeader: boolean; running: boolean }>()
const emit = defineEmits<{ issue: [] }>()

const label = computed(() => (props.issue ? RESOURCE_LABELS[props.issue.kind] : ''))
/** 발행 버튼을 누를 수 없는 이유. 없으면 빈 문자열 */
const blocked = computed(() => {
  const i = props.issue
  if (!i) return ''
  if (i.issuedToday) return '이번 라운드 발행 완료'
  if (!i.open) return i.lastRoundPhases ? `${i.lastRoundPhases.map((p) => PHASE_LABELS[p]).join(', ')} 단계에서 발행` : '지금은 발행할 수 없습니다'
  if (i.remaining <= 0) return '이번 라운드 발행 한도 없음'
  return ''
})
</script>

<template>
  <section class="area">
    <h2 class="ttl">재화</h2>
    <ul class="res">
      <li v-for="r in RESOURCES" :key="r.key" :class="`c-${r.key}`">
        <Icon :name="r.key" :label="r.label" />
        <span class="n">{{ (resources?.[r.key] ?? 0).toLocaleString('ko-KR') }}</span>
      </li>
    </ul>
    <template v-if="issue && running">
      <button v-if="isLeader && !blocked" class="fn" type="button" @click="emit('issue')"><Icon :name="issue.kind" />{{ label }} 발행<em>최대 {{ issue.remaining.toLocaleString('ko-KR') }}</em></button>
      <div v-else class="fn info" :class="`c-${issue.kind}`"><Icon :name="issue.kind" /><span>{{ blocked || `${label} 발행은 리더만` }}</span><em v-if="!issue.issuedToday">최대 {{ issue.remaining.toLocaleString('ko-KR') }}</em></div>
    </template>
  </section>
</template>

<style scoped>
.res { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.res li { display: flex; align-items: center; height: 44px; padding: 0 10px; background: #1c1f26; border: 2px solid #343946; font-size: 26px; }
.n { margin-left: auto; font: 800 31px/1 'Archivo', sans-serif; font-stretch: 88%; font-variant-numeric: tabular-nums; }
.c-gem { color: #f4f6fa; }
.c-gold { color: #ffc53d; }
.c-life { color: #5b9cff; }
.c-credit { color: #ff6b6b; }
.res .icon, .fn .icon { color: inherit; }
.fn { display: flex; align-items: center; gap: 8px; width: 100%; height: 44px; margin-top: 6px; padding: 0 12px; background: var(--accent); border: 0; color: var(--accent-fg); font-size: 17px; font-weight: 800; letter-spacing: 0; text-align: left; text-transform: none; }
.fn:hover { background: var(--accent); color: var(--accent-fg); }
.fn :deep(.icon) { font-size: 22px; color: inherit; }
.fn em { margin-left: auto; font-style: normal; font-size: 15.5px; font-weight: 700; }
.fn.info { padding: 0 10px; background: #1c1f26; border: 2px solid #343946; font-size: 15.5px; font-weight: 700; }
.fn.info span, .fn.info em { color: #f4f6fa; }
</style>
