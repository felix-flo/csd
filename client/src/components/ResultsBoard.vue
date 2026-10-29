<script setup lang="ts">
/**
 * 최종장 결과 (docs/100 N2 + D7, 룰 04 결과·보상). 프레젠테이션에서는 큰 글씨.
 * - 투표 마감 뒤: 득표 "보석 N표 · 골드 N표" (동점이면 가위바위보 결과)
 * - 결과 발표부터: 상금 화폐 + 마지막 라운드 발행량 (화이트 보석 · 옐로우 골드)
 * - 정산부터: 팀 · 살아남은 인원 · 채택 화폐 · 보상 %. 상대 발행팀은 "보상 없음"
 */
import { computed } from 'vue'
import { ISSUE_TEAM_CODE, RESOURCE_LABELS, shareText, type FinalState, type GameResults } from '../../../shared/game'
import { useTeamsStore } from '../stores/teams'
import TeamMark from './TeamMark.vue'

const props = defineProps<{ final: FinalState; results: GameResults | null; large?: boolean }>()
const teams = useTeamsStore()
const issuer = (kind: 'gem' | 'gold') => teams.teams.find((t) => t.code === ISSUE_TEAM_CODE[kind])?.name ?? (kind === 'gem' ? '화이트' : '옐로우')
const revealed = computed(() => !!props.final.lastIssue)
const adopted = computed(() => props.results?.adopted ?? props.final.adopted)
const tiebreakText = computed(() => (props.final.tiebreak ? `동점 · 가위바위보 ${issuer(props.final.tiebreak === 'white' ? 'gem' : 'gold')} 승` : ''))
</script>

<template>
  <div v-if="final.closed" class="card results" :class="{ large }">
    <h2>최종 결과</h2>
    <p class="votes mono">
      💎 보석 <strong>{{ final.tally?.gem }}</strong>표 · 🥇 골드 <strong>{{ final.tally?.gold }}</strong>표
      <span v-if="tiebreakText" class="muted">· {{ tiebreakText }}</span>
      <span v-else-if="final.tieUnresolved" class="muted">· 동점 — 화이트·옐로우 리더 가위바위보</span>
    </p>
    <template v-if="revealed && adopted">
      <p class="adopted">상금 화폐는 <strong>{{ adopted === 'gem' ? '💎' : '🥇' }} {{ RESOURCE_LABELS[adopted] }}</strong></p>
      <p class="issued muted">
        마지막 라운드 발행: {{ issuer('gem') }} 보석 <strong class="mono">{{ final.lastIssue?.gem }}</strong>개 ·
        {{ issuer('gold') }} 골드 <strong class="mono">{{ final.lastIssue?.gold }}</strong>개
      </p>
    </template>
    <table v-if="results" class="shares">
      <thead><tr><th>팀</th><th>살아남은 인원</th><th>{{ RESOURCE_LABELS[results.adopted] }}</th><th>보상</th></tr></thead>
      <tbody>
        <tr v-for="t in results.teams" :key="t.teamId" :class="{ excluded: t.excluded }">
          <td class="team"><TeamMark :color="t.color" :size="large ? 'lg' : undefined" />{{ t.name }}</td>
          <td class="mono">{{ t.alive }}명</td>
          <td class="mono">{{ t.excluded ? '—' : t.holding.toLocaleString('ko-KR') }}</td>
          <td class="mono share">{{ t.excluded ? '보상 없음' : shareText(t.share) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.votes { margin: 0; font-size: 1.1rem; }
.votes strong { font-size: 1.4rem; }
.adopted { margin: 12px 0 0; font-size: 1.3rem; }
.adopted strong { color: var(--blue); }
.issued { margin: 6px 0 0; }
.shares { width: 100%; border-collapse: collapse; margin-top: 14px; }
.shares th, .shares td { text-align: left; padding: 8px 12px 8px 0; border-bottom: 1px solid var(--line-soft); }
.shares th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
.shares tr:last-child td { border-bottom: none; }
.shares .share { font-weight: 700; }
.shares tr.excluded td { color: var(--muted); }
.team { font-weight: 600; }
.large h2 { font-size: 2.4rem; }
.large .votes { font-size: 1.8rem; }
.large .votes strong { font-size: 2.6rem; }
.large .adopted { font-size: 2.4rem; }
.large .issued { font-size: 1.3rem; }
.large .shares td { font-size: 1.7rem; padding: 14px 16px 14px 0; }
.large .shares th { font-size: 1rem; }
</style>
