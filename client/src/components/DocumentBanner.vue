<script setup lang="ts">
/** 문서 갱신 알림 배너. 모든 화면 상단에 표시 */
import { useRouter } from 'vue-router'
import { useDocumentsStore } from '../stores/documents'

const docs = useDocumentsStore()
const router = useRouter()

function open(slug: string) {
  docs.dismiss(slug)
  // 현재 문서는 rules 하나뿐. 문서가 늘어나면 slug 별 경로로 분기
  router.push('/rules').catch(() => {})
}
</script>

<template>
  <div v-for="slug in docs.updated" :key="slug" class="banner row">
    <span>📢 <strong>{{ docs.docs[slug]?.title ?? slug }}</strong> 이(가) 갱신되었습니다.</span>
    <button class="small" @click="open(slug)">보기</button>
    <button class="small secondary" @click="docs.dismiss(slug)">닫기</button>
  </div>
</template>

<style scoped>
.banner { background: var(--surface); color: var(--ink); border: 1px solid var(--line-soft); border-left: 3px solid var(--blue); border-radius: var(--radius); padding: 10px 12px; margin-bottom: 14px; }
.banner strong { color: var(--ink); }
button.small { padding: 4px 10px; font-size: 0.85rem; }
</style>
