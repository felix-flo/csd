<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRealtimeStore } from '../stores/realtime'
import { useTeamsStore } from '../stores/teams'
import { eventMessage, scopeLabel } from '../lib/eventLabel'

/** collapsible: 참가자 화면용 — 최신 3건만 보이고 나머지는 "펼치기" 로 (docs/103 §7) */
const props = defineProps<{ collapsible?: boolean }>()
const rt = useRealtimeStore()
const teams = useTeamsStore()
const all = computed(() => [...rt.events].reverse())
const SHOWN = 3
const expanded = ref(false)
const items = computed(() => (props.collapsible && !expanded.value ? all.value.slice(0, SHOWN) : all.value))
const hidden = computed(() => (props.collapsible ? Math.max(0, all.value.length - SHOWN) : 0))
const busy = ref(false)
const status = ref('')

/** 서버 기준으로 피드를 다시 받는다 (브라우저 상태가 꼬였을 때 복구용) */
async function reload() {
  busy.value = true
  status.value = ''
  const ok = await rt.loadRecent(true)
  status.value = ok ? `${rt.events.length}건 다시 불러옴` : '불러오기 실패'
  busy.value = false
}

</script>

<template>
  <div class="card">
    <div class="row" style="justify-content: space-between; margin-bottom: 8px">
      <h2 style="margin: 0">알림 <span class="muted">(마지막 id: {{ rt.lastEventId }})</span></h2>
      <span class="row">
        <span class="muted">{{ status }}</span>
        <button class="secondary small" :disabled="busy" @click="reload">다시 불러오기</button>
      </span>
    </div>
    <p v-if="all.length === 0" class="muted">받은 알림이 없습니다.</p>
    <ul v-else class="feed">
      <li v-for="ev in items" :key="ev.id">
        <span class="badge" :class="ev.scope" :style="ev.scope === 'group' ? { '--team': teams.colorOf(ev.targetId) } : undefined">{{ scopeLabel(ev) }}</span>
        <span class="muted"> #{{ ev.id }} · {{ ev.type }} · {{ ev.createdAt }}</span>
        <div>{{ eventMessage(ev) }}</div>
      </li>
    </ul>
    <button v-if="collapsible && (hidden > 0 || expanded)" class="secondary small" style="margin-top: 8px" type="button" @click="expanded = !expanded">
      {{ expanded ? '접기 (최신 3건만)' : `펼치기 (이전 ${hidden}건 더)` }}
    </button>
  </div>
</template>

<style scoped>
button.small { padding: 4px 10px; font-size: 0.85rem; }
/* 범위 뱃지의 색 점은 style.css .badge.group / .badge.user 에서 정의. 팀 범위는 --team 으로 팀 색을 넣는다 */
</style>
