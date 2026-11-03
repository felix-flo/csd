<script setup lang="ts">
/**
 * 최종장 결과 (휴대폰, docs/100 N2 + D7). 프레젠테이션은 FinalStage.
 * - 투표 마감 뒤: 득표 (동점이면 가위바위보 결과)
 * - 결과 발표부터: 상금 화폐 + 마지막 라운드 발행량
 * - 정산부터: 팀별 생존 인원 · 채택 화폐 · 보상. 상대 발행팀은 "보상 없음". 우리 팀은 강조
 * - 테러리스트 공개부터: 테러리스트 이름 · 팀 · 보상 (docs/100 N4)
 */
import { computed } from 'vue'
import { ISSUE_TEAM_CODE, RESOURCE_LABELS, shareText, type FinalState, type GameResults } from '../../../shared/game'
import { useTeamsStore } from '../stores/teams'
import Icon from './Icon.vue'
import TeamMark from './TeamMark.vue'

const props = defineProps<{ final: FinalState; results: GameResults | null; myTeamId?: number | null }>()
const teams = useTeamsStore()
const issuer = (kind: 'gem' | 'gold') => (teams.teams.find((t) => t.code === ISSUE_TEAM_CODE[kind])?.name ?? '').replace(/ 팀$/, '')
const adopted = computed(() => props.results?.adopted ?? props.final.adopted)
const teamOf = (id: number | null) => (id == null ? undefined : teams.byId(id))
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const tieText = computed(() => {
  if (props.final.tiebreak) return `동점 · 가위바위보 ${issuer(props.final.tiebreak === 'white' ? 'gem' : 'gold')} 승`
  return props.final.tieUnresolved ? '동점 · 화이트와 골드 리더가 가위바위보로 정합니다' : ''
})
</script>

<template>
  <div v-if="final.closed" class="card results">
    <p class="label">최종 결과</p>
    <h2 v-if="final.lastIssue && adopted" class="adopted">상금 화폐는 <Icon :name="adopted" /> {{ RESOURCE_LABELS[adopted] }}</h2>
    <p class="votes">보석 <strong class="mono">{{ final.tally?.gem }}</strong>표 · 골드 <strong class="mono">{{ final.tally?.gold }}</strong>표<span v-if="tieText" class="muted"> · {{ tieText }}</span></p>
    <p v-if="final.lastIssue" class="muted issued">마지막 발행: 보석 {{ final.lastIssue.gem }}개 · 골드 {{ final.lastIssue.gold }}개</p>
    <ul v-if="results" class="shares">
      <li v-for="t in results.teams" :key="t.teamId" :class="{ excluded: t.excluded, mine: t.teamId === myTeamId }">
        <span class="team"><TeamMark :color="t.color" />{{ t.name }}</span>
        <span class="muted">생존 {{ t.alive }}명<template v-if="!t.excluded"> · {{ RESOURCE_LABELS[results.adopted] }} {{ t.holding.toLocaleString('ko-KR') }}</template></span>
        <strong class="share mono">{{ t.excluded ? '보상 없음' : shareText(t.share) }}</strong>
      </li>
    </ul>
    <div v-if="final.spies" class="spies">
      <p v-if="!final.spies.length"><Icon name="spy" /> 테러리스트는 없었습니다</p>
      <p v-for="x in final.spies" :key="x.userId">
        <Icon name="spy" /> 테러리스트는 <strong>{{ x.name }}</strong>님<span v-if="teamOf(x.teamId)" class="muted"> ({{ teamOf(x.teamId)!.name }})</span>
        · 보상 <strong class="mono">{{ x.alive ? won(x.reward) : '0원 (탈락)' }}</strong>
      </p>
    </div>
  </div>
</template>

<style scoped>
.results .label { margin: 0 0 6px; }
.adopted { margin: 0 0 6px; font-size: 1.6rem; }
.votes { margin: 0; }
.issued { margin: 4px 0 0; font-size: 0.9rem; }
.shares { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.shares li { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 12px; padding: 10px 12px; border-radius: var(--radius); background: var(--bg-soft); }
.shares li .muted { grid-column: 1; font-size: 0.85rem; }
.shares .share { grid-column: 2; grid-row: 1 / 3; align-self: center; font-size: 1.3rem; }
.shares li.excluded { opacity: 0.6; }
.shares li.excluded .share { font-size: 0.95rem; }
.shares li.mine { box-shadow: inset 0 0 0 2px var(--ink); }
.team { font-weight: 700; display: flex; align-items: center; gap: 6px; }
.spies { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--line-soft); }
.spies p { margin: 4px 0; }
</style>
