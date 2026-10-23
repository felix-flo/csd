<script setup lang="ts">
/**
 * 룰북 보기. 모든 역할 공용. 프레젠테이션용 큰 글씨 모드 포함 (docs/98.룰북_팀별룰.md)
 * - 참가자: 전체 룰 → 가로줄(---) → 우리 팀 룰. 팀 룰은 게임 시작 후에만 오고, 비어 있으면 전체 룰만
 * - 프레젠테이션: 전체 룰만
 * - 관리자: "보기" 에서 팀을 고르면 그 팀원이 보는 화면 그대로 미리보기
 * 팀 이동·게임 시작·리셋 때 다시 받는다 (팀 룰 갱신은 document.updated 이벤트로)
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useDocumentsStore } from '../stores/documents'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import MarkdownView from '../components/MarkdownView.vue'
import type { DocumentInfo } from '../../../shared/types'
import { teamLetter } from '../../../shared/game'

const auth = useAuthStore()
const docs = useDocumentsStore()
const game = useGameStore()
const teams = useTeamsStore()
const router = useRouter()
const large = ref(auth.user?.role === 'presenter')
const isAdmin = computed(() => auth.user?.role === 'admin')
/** 관리자 미리보기: null = 전체 룰만(프레젠테이션 화면), 숫자 = 그 팀원 화면 */
const previewTeam = ref<number | null>(null)

const rules = computed(() => docs.rules)
const teamRule = computed<DocumentInfo | null>(() => {
  const r = rules.value
  if (!r) return null
  if (isAdmin.value) return r.teams?.find((t) => t.teamId === previewTeam.value) ?? null
  return r.team
})
/** 전체 룰 + 가로줄 + 팀 룰 (팀 룰이 비어 있으면 전체 룰만) */
const markdown = computed(() => {
  const r = rules.value
  if (!r) return ''
  const t = teamRule.value
  if (!t || !t.markdown.trim()) return r.global.markdown
  return `${r.global.markdown}\n\n---\n\n# ${t.title}\n\n${t.markdown}`
})
const updatedAt = computed(() => {
  const times = [rules.value?.global.updatedAt, teamRule.value?.markdown.trim() ? teamRule.value.updatedAt : undefined].filter(Boolean) as string[]
  return times.sort().at(-1) ?? ''
})

onMounted(() => {
  docs.dismissRules()
  void docs.loadRules()
  if (!game.state) void game.load()
  if (isAdmin.value && teams.teams.length === 0) void teams.load()
})
// 팀 이동, 게임 시작(팀 룰 공개)·리셋 때 다시 받는다
watch(() => [auth.user?.groupId, game.state?.status], () => void docs.loadRules())

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else document.documentElement.requestFullscreen?.().catch(() => {})
}
</script>

<template>
  <div class="page" :style="{ maxWidth: large ? '1100px' : '720px' }">
    <div class="topbar">
      <h1 style="margin: 0">{{ rules?.global.title ?? '룰' }}</h1>
      <div class="row">
        <select v-if="isAdmin" v-model="previewTeam" title="누구의 화면으로 볼지">
          <option :value="null">전체 룰만 (프레젠테이션)</option>
          <option v-for="(t, i) in teams.teams" :key="t.id" :value="t.id">{{ teamLetter(i) }} · {{ t.name }} 팀원 화면</option>
        </select>
        <button class="secondary" @click="large = !large">{{ large ? '보통 글씨' : '큰 글씨' }}</button>
        <button v-if="auth.user?.role !== 'member'" class="secondary" @click="toggleFullscreen">전체화면</button>
        <button v-if="isAdmin" class="secondary" @click="router.push('/admin')">편집</button>
        <button class="secondary" @click="router.push(auth.homePath)">돌아가기</button>
      </div>
    </div>
    <div class="card">
      <p v-if="!rules" class="muted">불러오는 중…</p>
      <MarkdownView v-else :markdown="markdown" :large="large" />
      <p v-if="rules" class="muted" style="margin-top: 16px">마지막 수정: {{ updatedAt }}</p>
    </div>
  </div>
</template>
