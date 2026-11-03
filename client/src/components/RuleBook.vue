<script setup lang="ts">
/** 룰을 탭으로 나눠 보여 준다. 팀 룰이 있으면 맨 끝에 "우리 팀" 탭. 룰이 바뀌어도(4·6라운드 공개) 보던 탭을 유지한다 */
import { computed, ref } from 'vue'
import { splitRuleTabs } from '../lib/ruleTabs'
import MarkdownView from './MarkdownView.vue'

const props = defineProps<{ markdown: string; teamMarkdown?: string; large?: boolean }>()

const tabs = computed(() => [
  ...splitRuleTabs(props.markdown),
  ...(props.teamMarkdown?.trim() ? [{ title: '우리 팀', markdown: props.teamMarkdown }] : []),
])
const picked = ref('')
const current = computed(() => tabs.value.find((t) => t.title === picked.value) ?? tabs.value[0])

function pick(title: string, e: Event) {
  picked.value = title
  ;(e.currentTarget as HTMLElement).scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
}
</script>

<template>
  <nav v-if="tabs.length > 1" class="rule-tabs" :class="{ large }" role="tablist" aria-label="룰 목차">
    <button
      v-for="t in tabs"
      :key="t.title"
      type="button"
      role="tab"
      :aria-selected="t === current"
      :class="{ on: t === current }"
      @click="pick(t.title, $event)"
    >{{ t.title }}</button>
  </nav>
  <MarkdownView v-if="current" :key="current.title" class="rule-body" :markdown="current.markdown" :large="large" />
</template>

<style scoped>
.rule-tabs { position: sticky; top: 0; z-index: 1; display: flex; gap: 20px; overflow-x: auto; scrollbar-width: none; margin: -6px -2px 8px; padding: 0 2px; background: var(--surface); border-bottom: 1px solid var(--line); }
.rule-tabs::-webkit-scrollbar { display: none; }
.rule-tabs button { flex: none; min-height: 44px; padding: 0 2px; border-radius: 0; background: none; color: var(--muted); }
.rule-tabs button:hover { background: none; color: var(--ink); }
.rule-tabs button.on { color: var(--ink); font-weight: 700; box-shadow: inset 0 -2px 0 var(--ink); }
.rule-tabs.large button { font-size: 1.4rem; min-height: 60px; }
.rule-body :deep(h2:first-child) { margin-top: 0.4em; }
</style>
