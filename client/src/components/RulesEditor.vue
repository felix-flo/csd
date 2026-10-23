<script setup lang="ts">
/**
 * 관리자용 룰북 편집기 (docs/98.룰북_팀별룰.md): "전체 / A · 화이트 팀 / B · …" 탭, 탭마다 마크다운 입력 + 미리보기, 직전 버전 되돌리기.
 * - 전체 룰: 모든 역할이 본다. 저장하면 전체에 갱신 알림
 * - 팀 룰  : 그 팀 팀원만 (게임 시작 후). 팀원 화면에서는 전체 룰 아래 가로줄(---) 다음에 붙는다. 제목은 팀 이름으로 자동.
 *            저장하면 그 팀(+진행자)에게만 갱신 알림
 */
import { computed, onMounted, ref, watch } from 'vue'
import type { DocumentInfo } from '../../../shared/types'
import { teamLetter } from '../../../shared/game'
import { api } from '../lib/api'
import { GLOBAL_RULES_SLUG, useDocumentsStore } from '../stores/documents'
import { useTeamsStore } from '../stores/teams'
import MarkdownView from './MarkdownView.vue'
import TeamMark from './TeamMark.vue'

const docs = useDocumentsStore()
const teams = useTeamsStore()
/** null = 전체 룰, 숫자 = 팀 id */
const tab = ref<number | null>(null)
const title = ref('')
const markdown = ref('')
const busy = ref(false)
const status = ref('')
const preview = ref(true)

const saved = computed<DocumentInfo | undefined>(() => {
  const r = docs.rules
  if (!r) return undefined
  return tab.value == null ? r.global : r.teams?.find((t) => t.teamId === tab.value)
})
const isTeam = computed(() => tab.value != null)
const dirty = computed(() => !!saved.value && ((!isTeam.value && title.value !== saved.value.title) || markdown.value !== saved.value.markdown))

function loadInto(doc: DocumentInfo | undefined) {
  if (!doc) return
  title.value = doc.title
  markdown.value = doc.markdown
}

onMounted(async () => {
  if (!docs.rules?.teams) await docs.loadRules()
  if (teams.teams.length === 0) void teams.load()
  loadInto(saved.value)
})

// 다른 관리자가 저장해 실시간 갱신이 오면, 내가 편집 중이 아닐 때만 반영
watch(saved, (doc) => {
  if (doc && !dirty.value) loadInto(doc)
})

function selectTab(next: number | null) {
  if (next === tab.value) return
  if (dirty.value && !confirm('저장하지 않은 변경이 있습니다. 버리고 다른 룰로 넘어갈까요?')) return
  tab.value = next
  status.value = ''
  loadInto(saved.value)
}

const teamName = (id: number | null) => teams.teams.find((t) => t.id === id)?.name ?? ''
const savedMessage = computed(() => (isTeam.value ? `저장됨. ${teamName(tab.value)} 팀원에게만 갱신 알림을 보냈습니다.` : '저장됨. 모든 참가자에게 갱신 알림을 보냈습니다.'))

async function save() {
  busy.value = true
  status.value = ''
  try {
    const res = isTeam.value
      ? await api.put<{ document: DocumentInfo }>(`/api/admin/rules/team/${tab.value}`, { markdown: markdown.value })
      : await api.put<{ document: DocumentInfo }>(`/api/admin/documents/${GLOBAL_RULES_SLUG}`, { title: title.value, markdown: markdown.value })
    docs.set(res.document)
    docs.dismiss(res.document.slug)
    loadInto(res.document)
    status.value = savedMessage.value
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
    const path = isTeam.value ? `/api/admin/rules/team/${tab.value}/restore` : `/api/admin/documents/${GLOBAL_RULES_SLUG}/restore`
    const res = await api.post<{ document: DocumentInfo }>(path)
    docs.set(res.document)
    docs.dismiss(res.document.slug)
    loadInto(res.document)
    status.value = '직전 버전으로 되돌렸습니다.'
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}

const placeholder = computed(() => (isTeam.value ? '## 우리 팀만의 규칙\n- ...' : '# 게임 룰\n\n## 1. 재화\n- ...'))
const hasContent = (teamId: number) => !!docs.rules?.teams?.find((t) => t.teamId === teamId)?.markdown.trim()
</script>

<template>
  <div class="card">
    <h2>룰 편집 <span class="muted">(마크다운)</span></h2>
    <p class="muted">
      <strong>전체 룰</strong>은 모든 참가자·진행자·프레젠테이션 화면에, <strong>팀 룰</strong>은 그 팀 팀원에게만(게임 시작 후) 보입니다.
      팀원 화면에서는 전체 룰 아래 가로줄 다음에 팀 룰이 붙습니다. 상단 "룰" 버튼으로 볼 수 있습니다.
      제목은 # , 소제목은 ## , 목록은 - , 표는 | 로 작성합니다.
    </p>
    <div class="tabs row">
      <button type="button" class="tab" :class="{ on: tab === null }" @click="selectTab(null)">전체 룰</button>
      <button v-for="(t, i) in teams.teams" :key="t.id" type="button" class="tab" :class="{ on: tab === t.id }" @click="selectTab(t.id)">
        <span class="mono">{{ teamLetter(i) }}</span> <TeamMark :color="t.color" />{{ t.name }}
        <span v-if="!hasContent(t.id)" class="muted">(비어 있음)</span>
      </button>
    </div>
    <div class="row" style="margin-bottom: 8px">
      <input v-if="!isTeam" v-model="title" maxlength="50" placeholder="문서 제목" style="width: 14em" />
      <strong v-else>{{ saved?.title }}</strong>
      <button :disabled="busy || !dirty" @click="save">저장</button>
      <button class="secondary" :disabled="busy || !saved?.hasPrevious" @click="restore">직전 버전으로</button>
      <button class="secondary" @click="preview = !preview">{{ preview ? '미리보기 숨김' : '미리보기' }}</button>
      <span class="muted">{{ dirty ? '저장되지 않은 변경 있음' : status }}</span>
    </div>
    <p v-if="isTeam" class="muted" style="margin-top: 0">제목은 팀 이름으로 자동으로 붙습니다. 비워 두면 팀원 화면에 전체 룰만 보입니다.</p>
    <div class="editor" :class="{ split: preview }">
      <textarea v-model="markdown" spellcheck="false" :placeholder="placeholder" />
      <div v-if="preview" class="preview"><MarkdownView :markdown="markdown" /></div>
    </div>
  </div>
</template>

<style scoped>
.tabs { gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.tab { background: var(--surface); color: var(--ink); border: 1px solid var(--line); padding: 5px 12px; font-size: 0.9rem; }
.tab.on { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.tab.on .muted { color: inherit; opacity: 0.7; }
.editor { display: grid; gap: 12px; }
.editor.split { grid-template-columns: 1fr 1fr; }
@media (max-width: 800px) { .editor.split { grid-template-columns: 1fr; } }
textarea { width: 100%; min-height: 360px; font-family: var(--font-mono); font-size: 0.92rem; line-height: 1.5; resize: vertical; }
.preview { border: 1px solid var(--line-soft); border-radius: var(--radius); background: var(--surface); padding: 12px; min-height: 360px; overflow: auto; }
</style>
