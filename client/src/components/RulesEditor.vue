<script setup lang="ts">
/** 관리자용 룰 편집기: 마크다운 입력 + 미리보기, 직전 버전 되돌리기 */
import { computed, onMounted, ref, watch } from 'vue'
import type { DocumentInfo } from '../../../shared/types'
import { api } from '../lib/api'
import { useDocumentsStore } from '../stores/documents'
import MarkdownView from './MarkdownView.vue'

const SLUG = 'rules'
const docs = useDocumentsStore()
const title = ref('')
const markdown = ref('')
const busy = ref(false)
const status = ref('')
const preview = ref(true)

const saved = computed(() => docs.docs[SLUG])
const dirty = computed(() => !!saved.value && (title.value !== saved.value.title || markdown.value !== saved.value.markdown))

function loadInto(doc: DocumentInfo) {
  title.value = doc.title
  markdown.value = doc.markdown
}

onMounted(async () => {
  const doc = saved.value ?? (await docs.load(SLUG))
  if (doc) loadInto(doc)
})

// 다른 관리자가 저장해 실시간 갱신이 오면, 내가 편집 중이 아닐 때만 반영
watch(saved, (doc) => {
  if (doc && !dirty.value) loadInto(doc)
})

async function save() {
  busy.value = true
  status.value = ''
  try {
    const res = await api.put<{ document: DocumentInfo }>(`/api/admin/documents/${SLUG}`, {
      title: title.value,
      markdown: markdown.value,
    })
    docs.set(res.document)
    docs.dismiss(SLUG)
    loadInto(res.document)
    status.value = '저장됨. 모든 참가자에게 갱신 알림을 보냈습니다.'
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}

async function restore() {
  if (!confirm('직전 버전으로 되돌릴까요? 현재 내용은 "직전 버전" 으로 보관됩니다.')) return
  busy.value = true
  status.value = ''
  try {
    const res = await api.post<{ document: DocumentInfo }>(`/api/admin/documents/${SLUG}/restore`)
    docs.set(res.document)
    docs.dismiss(SLUG)
    loadInto(res.document)
    status.value = '직전 버전으로 되돌렸습니다.'
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="card">
    <h2>룰 편집 <span class="muted">(마크다운)</span></h2>
    <p class="muted">
      저장하면 모든 참가자·진행자·프레젠테이션 화면에 갱신 알림이 가고, 상단 "룰" 버튼으로 볼 수 있습니다.
      제목은 # , 소제목은 ## , 목록은 - , 표는 | 로 작성합니다.
    </p>
    <div class="row" style="margin-bottom: 8px">
      <input v-model="title" maxlength="50" placeholder="문서 제목" style="width: 14em" />
      <button :disabled="busy || !dirty" @click="save">저장</button>
      <button class="secondary" :disabled="busy || !saved?.hasPrevious" @click="restore">직전 버전으로</button>
      <button class="secondary" @click="preview = !preview">{{ preview ? '미리보기 숨김' : '미리보기' }}</button>
      <span class="muted">{{ dirty ? '저장되지 않은 변경 있음' : status }}</span>
    </div>
    <div class="editor" :class="{ split: preview }">
      <textarea v-model="markdown" spellcheck="false" placeholder="# 게임 룰&#10;&#10;## 1. 재화&#10;- ..." />
      <div v-if="preview" class="preview"><MarkdownView :markdown="markdown" /></div>
    </div>
  </div>
</template>

<style scoped>
.editor { display: grid; gap: 12px; }
.editor.split { grid-template-columns: 1fr 1fr; }
@media (max-width: 800px) { .editor.split { grid-template-columns: 1fr; } }
textarea { width: 100%; min-height: 360px; font-family: var(--font-mono); font-size: 0.92rem; line-height: 1.5; resize: vertical; }
.preview { border: 1px solid var(--line-soft); border-radius: var(--radius); background: var(--surface); padding: 12px; min-height: 360px; overflow: auto; }
</style>
