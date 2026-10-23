<script setup lang="ts">
/**
 * 보석·골드 발행 요청 처리 (관리자). 화이트팀 리더 → 보석, 옐로우팀 리더 → 골드.
 * - 요청이 오면 팝업(소리 없음)이 뜬다. 수락하면 팀 재화에 더해지고, 거절하면 요청 수량이 한도로 돌아간다.
 *   "나중에" 로 닫아도 아래 카드의 대기 목록에서 처리할 수 있다. 다른 진행자가 먼저 처리하면 팝업은 저절로 닫힌다.
 * - 보석 발행은 화이트팀과 진행자만 안다. 골드는 수락하면 이번 발행 수량이 전체에 1회 공개된다.
 */
import { computed, ref } from 'vue'
import type { GroupInfo } from '../../../shared/types'
import { ISSUE_STATUS_LABELS, RESOURCE_LABELS, type AdminGameView, type IssueRequestView } from '../../../shared/game'
import { RESOURCE_BY_KEY } from '../lib/resources'
import { api, ApiError } from '../lib/api'
import { useGameStore } from '../stores/game'
import TeamMark from './TeamMark.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ groups: GroupInfo[] }>()
const game = useGameStore()
const busy = ref(false)
const message = ref('')
/** "나중에" 로 닫은 요청 (이 화면에서만) */
const later = ref(new Set<number>())

const issues = computed(() => game.admin?.issues)
const status = computed(() => game.admin?.state.status)
const visible = computed(() => (status.value === 'running' || status.value === 'ended') && !!issues.value)
const popup = computed(() => issues.value?.pending.find((r) => !later.value.has(r.id)) ?? null)

const team = (id: number) => props.groups.find((g) => g.id === id)
const label = (r: IssueRequestView) => `${RESOURCE_BY_KEY[r.kind].emoji} ${RESOURCE_LABELS[r.kind]} ${r.amount}개`
const remainingText = (kind: 'gem' | 'gold') => {
  const v = issues.value?.remaining[kind]
  return v == null ? '-' : `${v}개`
}

function popupMessage(r: IssueRequestView): string {
  const who = `${team(r.teamId)?.name ?? '알 수 없는 팀'} 리더 ${r.requestedByName ?? ''}`.trim()
  const reveal = r.kind === 'gold' ? '수락하면 전체에 "골드 발행" 이 수량과 함께 공개됩니다.' : '보석 발행은 화이트팀과 진행자만 압니다.'
  return `${who} 님이 ${RESOURCE_LABELS[r.kind]} ${r.amount}개 발행을 요청했습니다 (${r.day}일차).\n${reveal}`
}

async function decide(r: IssueRequestView, accept: boolean) {
  busy.value = true
  message.value = ''
  try {
    game.setAdmin(await api.post<AdminGameView>(`/api/admin/issue/${r.id}/decide`, { accept }))
    message.value = `${team(r.teamId)?.name ?? ''} ${RESOURCE_LABELS[r.kind]} ${r.amount}개 ${accept ? '수락' : '거절'}`
  } catch (e) {
    message.value = e instanceof ApiError && e.detail ? e.detail : `실패: ${(e as Error).message}`
    void game.load()
  } finally {
    busy.value = false
  }
}

function postpone(r: IssueRequestView) {
  later.value = new Set([...later.value, r.id])
}
</script>

<template>
  <div v-if="visible && issues" class="card">
    <h2>보석 · 골드 발행 <span v-if="issues.pending.length" class="badge warn">대기 {{ issues.pending.length }}</span></h2>
    <p class="muted">
      이번 일차 남은 발행 가능량 — 💎 보석 <strong>{{ remainingText('gem') }}</strong> (일차마다 한도, 이월 없음) ·
      🥇 골드 <strong>{{ remainingText('gold') }}</strong> (안 쓴 만큼 이월). 대기 중인 요청도 뺀 값입니다.
    </p>

    <table v-if="issues.pending.length" class="list">
      <tbody>
        <tr v-for="r in issues.pending" :key="r.id">
          <td class="nowrap"><TeamMark v-if="team(r.teamId)" :color="team(r.teamId)!.color" />{{ team(r.teamId)?.name }}</td>
          <td><strong>{{ label(r) }}</strong></td>
          <td class="muted">{{ r.day }}일차 · {{ r.requestedByName }}</td>
          <td class="actions">
            <button class="secondary small" :disabled="busy" @click="decide(r, false)">거절</button>
            <button class="small" :disabled="busy" @click="decide(r, true)">수락</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="muted" style="margin: 0">대기 중인 요청이 없습니다.</p>
    <p v-if="message" class="muted" style="margin: 6px 0 0">{{ message }}</p>

    <details v-if="issues.recent.length" style="margin-top: 10px">
      <summary class="muted">최근 요청 {{ issues.recent.length }}건</summary>
      <table class="list">
        <tbody>
          <tr v-for="r in issues.recent" :key="r.id">
            <td class="nowrap"><TeamMark v-if="team(r.teamId)" :color="team(r.teamId)!.color" />{{ team(r.teamId)?.name }}</td>
            <td>{{ label(r) }}</td>
            <td class="muted">{{ r.day }}일차 · {{ r.requestedByName }}</td>
            <td><span class="badge" :class="{ on: r.status === 'approved', warn: r.status === 'pending', off: r.status === 'rejected' || r.status === 'cancelled' }">{{ ISSUE_STATUS_LABELS[r.status] }}</span></td>
          </tr>
        </tbody>
      </table>
    </details>

    <ModalDialog
      :open="!!popup"
      :title="popup ? `${RESOURCE_LABELS[popup.kind]} 발행 요청` : ''"
      :message="popup ? popupMessage(popup) : ''"
      confirm-label="수락"
      alt-label="거절"
      cancel-label="나중에"
      :busy="busy"
      @confirm="popup && decide(popup, true)"
      @alt="popup && decide(popup, false)"
      @cancel="popup && postpone(popup)"
    />
  </div>
</template>

<style scoped>
.list { border-collapse: collapse; font-size: 0.9rem; width: 100%; margin-top: 6px; }
.list td { padding: 5px 8px 5px 0; border-bottom: 1px solid var(--line-soft); }
.actions { text-align: right; white-space: nowrap; }
.actions button + button { margin-left: 6px; }
button.small { padding: 4px 10px; font-size: 0.85rem; }
.nowrap { white-space: nowrap; }
</style>
