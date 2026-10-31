<script setup lang="ts">
import Icon from './Icon.vue'
/**
 * 보석·골드 발행 현황 (관리자). 화이트팀 리더 → 보석, 옐로우팀 리더 → 골드.
 * 요청 즉시 자동 발행되므로(docs/103 §9) 처리할 것은 없고, 남은 한도와 발행 기록만 보여 준다.
 * 보석 발행은 화이트팀과 진행자만 안다. 골드는 발행 수량이 전체에 1회 공개된다 (마지막 라운드 제외).
 */
import { computed } from 'vue'
import type { GroupInfo } from '../../../shared/types'
import { ISSUE_STATUS_LABELS, RESOURCE_LABELS, type IssueRequestView } from '../../../shared/game'
import { RESOURCE_BY_KEY } from '../lib/resources'
import { useGameStore } from '../stores/game'
import TeamMark from './TeamMark.vue'

const props = defineProps<{ groups: GroupInfo[] }>()
const game = useGameStore()
const issues = computed(() => game.admin?.issues)
const status = computed(() => game.admin?.state.status)
const visible = computed(() => (status.value === 'running' || status.value === 'final' || status.value === 'ended') && !!issues.value)

const team = (id: number) => props.groups.find((g) => g.id === id)
const label = (r: IssueRequestView) => `${RESOURCE_LABELS[r.kind]} ${r.amount}개`
const remainingText = (kind: 'gem' | 'gold') => {
  const v = issues.value?.remaining[kind]
  if (v == null) return '-'
  return issues.value?.issuedToday[kind] ? `이번 라운드 발행함 (남은 한도 ${v}개)` : `${v}개`
}
</script>

<template>
  <div v-if="visible && issues" class="card">
    <h2>보석 · 골드 발행</h2>
    <p class="muted">
      이번 라운드 남은 발행 가능량 — <Icon name="gem" /> 보석 <strong>{{ remainingText('gem') }}</strong> (라운드마다 한도, 이월 없음) ·
      <Icon name="gold" /> 골드 <strong>{{ remainingText('gold') }}</strong> (안 쓴 만큼 이월).
      리더가 요청하면 <strong>즉시 발행</strong>됩니다 (팀마다 라운드당 1회, 진행자 수락 없음).
    </p>
    <p v-if="issues.lastRound" class="last-round">
      <Icon name="lock" /> 마지막 라운드 발행 (비공개) — <Icon name="gem" /> 보석 <strong>{{ issues.lastRound.gem }}</strong>개 · <Icon name="gold" /> 골드 <strong>{{ issues.lastRound.gold }}</strong>개
    </p>
    <p v-if="!issues.recent.length" class="muted" style="margin: 0">아직 발행이 없습니다.</p>
    <table v-else class="list">
      <tbody>
        <tr v-for="r in issues.recent" :key="r.id">
          <td class="nowrap"><TeamMark v-if="team(r.teamId)" :color="team(r.teamId)!.color" />{{ team(r.teamId)?.name }}</td>
          <td>{{ label(r) }}</td>
          <td class="muted">{{ r.day }}라운드 · {{ r.requestedByName }}</td>
          <td><span class="badge" :class="{ on: r.status === 'approved', off: r.status !== 'approved' }">{{ ISSUE_STATUS_LABELS[r.status] }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.last-round { margin: 0 0 10px; padding: 8px 10px; border-radius: var(--radius); background: var(--bg-soft); }
.list { border-collapse: collapse; font-size: 0.9rem; width: 100%; margin-top: 6px; }
.list td { padding: 5px 8px 5px 0; border-bottom: 1px solid var(--line-soft); }
.nowrap { white-space: nowrap; }
</style>
