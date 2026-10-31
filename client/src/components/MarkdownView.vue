<script setup lang="ts">
/** 마크다운 → 정화된 HTML. 작성자는 관리자뿐이지만 방어적으로 DOMPurify 를 거친다. */
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{ markdown: string; large?: boolean }>()

marked.setOptions({ gfm: true, breaks: true })

const html = computed(() =>
  DOMPurify.sanitize(marked.parse(props.markdown ?? '') as string, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
  }),
)
</script>

<template>
  <div class="md" :class="{ large }" v-html="html" />
</template>

<style scoped>
.md { line-height: 1.6; word-break: keep-all; overflow-wrap: anywhere; }
.md.large { font-size: 1.5rem; line-height: 1.7; }
.md :deep(h1) { font-family: var(--font-display); font-weight: 900; font-size: 2em; line-height: 1; letter-spacing: -0.03em; margin: 0.4em 0 0.4em; }
.md :deep(h2) { font-family: var(--font-display); font-weight: 900; font-size: 1.5em; line-height: 1; margin: 1em 0 0.4em; border-bottom: 1px solid var(--line-soft); padding-bottom: 6px; }
.md :deep(h3) { font-size: 1.1em; margin: 0.8em 0 0.3em; }
.md :deep(p) { margin: 0.5em 0; }
.md :deep(ul), .md :deep(ol) { padding-left: 1.4em; margin: 0.4em 0; }
.md :deep(li) { margin: 0.2em 0; }
.md :deep(table) { border-collapse: collapse; margin: 0.6em 0; width: 100%; }
.md :deep(th), .md :deep(td) { border: 1px solid var(--line-soft); padding: 6px 10px; text-align: left; }
.md :deep(th) { background: var(--bg-soft); font-family: var(--font-mono); font-size: 0.85em; letter-spacing: 0.04em; }
.md :deep(blockquote) { margin: 0.6em 0; padding: 4px 12px; border-left: 3px solid var(--line-strong); color: var(--muted); }
.md :deep(code) { background: var(--bg-soft); border-radius: 4px; padding: 1px 5px; font-family: var(--font-mono); font-size: 0.9em; }
.md :deep(pre) { background: var(--bg-soft); border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 10px; overflow-x: auto; }
.md :deep(pre code) { background: none; padding: 0; }
.md :deep(img) { max-width: 100%; height: auto; }
.md :deep(hr) { border: none; border-top: 1px solid var(--line-soft); margin: 1em 0; }
.md :deep(a) { color: var(--blue); }
</style>
