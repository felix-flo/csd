<script setup lang="ts">
/** 룰 문서 보기. 모든 역할 공용. 프레젠테이션용 큰 글씨 모드 포함 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useDocumentsStore } from '../stores/documents'
import MarkdownView from '../components/MarkdownView.vue'

const auth = useAuthStore()
const docs = useDocumentsStore()
const router = useRouter()
const large = ref(auth.user?.role === 'presenter')
const doc = computed(() => docs.docs['rules'])

onMounted(() => {
  docs.dismiss('rules')
  docs.load('rules')
})

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else document.documentElement.requestFullscreen?.().catch(() => {})
}
</script>

<template>
  <div class="page" :style="{ maxWidth: large ? '1100px' : '720px' }">
    <div class="topbar">
      <h1 style="margin: 0">{{ doc?.title ?? '룰' }}</h1>
      <div class="row">
        <button class="secondary" @click="large = !large">{{ large ? '보통 글씨' : '큰 글씨' }}</button>
        <button v-if="auth.user?.role !== 'member'" class="secondary" @click="toggleFullscreen">전체화면</button>
        <button v-if="auth.user?.role === 'admin'" class="secondary" @click="router.push('/admin')">편집</button>
        <button class="secondary" @click="router.push(auth.homePath)">돌아가기</button>
      </div>
    </div>
    <div class="card">
      <p v-if="!doc" class="muted">불러오는 중…</p>
      <MarkdownView v-else :markdown="doc.markdown" :large="large" />
      <p v-if="doc" class="muted" style="margin-top: 16px">마지막 수정: {{ doc.updatedAt }}</p>
    </div>
  </div>
</template>
