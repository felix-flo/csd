<script setup lang="ts">
/**
 * 최종장 (프레젠테이션). 단계마다 화면 전체를 쓴다: 최종 투표 → 투표 마감(득표) → 결과 발표(상금 화폐) → 정산(팀별 보상) → 테러리스트 공개.
 * 공지 화면(z 1400)이 위에 뜰 수 있게 한 단계 아래에 둔다.
 */
import { computed } from 'vue'
import { ISSUE_TEAM_CODE, RESOURCE_LABELS, shareText, type FinalState, type GameResults } from '../../../shared/game'
import { useTeamsStore } from '../stores/teams'
import Crest from './Crest.vue'
import Icon from './Icon.vue'

const props = defineProps<{ final: FinalState; results: GameResults | null; lifeVote: boolean }>()
const teams = useTeamsStore()
const issuer = (kind: 'gem' | 'gold') => (teams.teams.find((t) => t.code === ISSUE_TEAM_CODE[kind])?.name ?? '').replace(/ 팀$/, '')
const adopted = computed(() => props.results?.adopted ?? props.final.adopted)
const codeOf = (id: number | null | undefined) => (id == null ? undefined : teams.byId(id)?.code)
const nameOf = (id: number | null | undefined) => (id == null ? '' : teams.byId(id)?.name ?? '')
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const tieText = computed(() => {
  if (props.final.tiebreak) return `동점 · 가위바위보 ${issuer(props.final.tiebreak === 'white' ? 'gem' : 'gold')} 승`
  return props.final.tieUnresolved ? '동점 · 화이트와 골드 리더가 가위바위보로 정합니다' : ''
})
/** 보여 줄 장면 */
const scene = computed(() => {
  const f = props.final
  if (f.spies) return 'spy'
  if (f.step === 'settle' && props.results) return 'settle'
  if (f.step === 'result' && adopted.value) return 'result'
  return f.closed ? 'closed' : 'vote'
})
</script>

<template>
  <div class="final" :class="scene">
    <template v-if="scene === 'vote'">
      <p class="kicker">최종장</p>
      <h1>최종 투표</h1>
      <div class="lines">
        <p>휴대폰에서 보석과 골드 중 하나에 투표해 주세요.</p>
        <p v-if="lifeVote">라이프 투표권에 뽑힌 사람은 2표로 계산됩니다.</p>
      </div>
      <p class="count mono"><strong>{{ final.votes.done }}</strong> / {{ final.votes.eligible }}명 투표</p>
    </template>

    <template v-else-if="scene === 'closed'">
      <p class="kicker">투표 마감</p>
      <h1 class="tally"><span><Icon name="gem" /> 보석 {{ final.tally?.gem }}표</span><span><Icon name="gold" /> 골드 {{ final.tally?.gold }}표</span></h1>
      <p v-if="tieText" class="line">{{ tieText }}</p>
    </template>

    <template v-else-if="scene === 'result'">
      <p class="kicker">결과 발표</p>
      <h1>상금 화폐는<br /><span class="adopted"><Icon :name="adopted!" /> {{ RESOURCE_LABELS[adopted!] }}</span>입니다.</h1>
      <div class="lines">
        <p>보석 {{ final.tally?.gem }}표 · 골드 {{ final.tally?.gold }}표<template v-if="tieText"> · {{ tieText }}</template></p>
        <p v-if="final.lastIssue">마지막 발행: 보석 {{ final.lastIssue.gem }}개 · 골드 {{ final.lastIssue.gold }}개</p>
      </div>
    </template>

    <template v-else-if="scene === 'settle' && results">
      <p class="kicker">정산 · {{ RESOURCE_LABELS[results.adopted] }} 채택</p>
      <h1>팀별 보상</h1>
      <ul class="shares">
        <li v-for="t in results.teams" :key="t.teamId" :class="{ excluded: t.excluded }">
          <Crest :team="codeOf(t.teamId)" size="7vh" />
          <span class="name">{{ t.name.replace(/ 팀$/, '') }}</span>
          <span class="alive">생존 {{ t.alive }}명</span>
          <span class="hold mono">{{ t.excluded ? '' : `${RESOURCE_LABELS[results.adopted]} ${t.holding.toLocaleString('ko-KR')}` }}</span>
          <strong class="share mono">{{ t.excluded ? '보상 없음' : shareText(t.share) }}</strong>
        </li>
      </ul>
    </template>

    <template v-else-if="scene === 'spy'">
      <p class="kicker">테러리스트 공개</p>
      <h1 v-if="!final.spies!.length">테러리스트는<br />없었습니다.</h1>
      <template v-else>
        <h1>테러리스트는<br />{{ final.spies!.map((x) => `${x.name}님`).join(', ') }}이었습니다.</h1>
        <div class="lines">
          <p v-for="x in final.spies!" :key="x.userId">
            <Crest v-if="codeOf(x.teamId)" :team="codeOf(x.teamId)" size="4vh" /> {{ nameOf(x.teamId) }} · 보상 {{ x.alive ? won(x.reward) : '0원 (탈락)' }}
          </p>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.final { position: fixed; inset: 0; z-index: 1300; background: var(--bg); color: var(--ink); display: flex; flex-direction: column; justify-content: center; gap: 3.4vh; padding: 0 8vw; animation: fade-in 0.6s ease both; }
.final.spy { background: #0d0d0d; color: #fff; }
.kicker { margin: 0; font-size: 3vh; font-weight: 700; color: var(--muted); }
.spy .kicker { color: #c9c7c1; }
.spy h1, .spy .lines p { color: #fff; }
.spy .lines p { display: flex; align-items: center; gap: 1.2vw; }
h1 { font-size: 11vh; line-height: 1.16; margin: 0; }
.adopted { color: var(--blue); }
.tally { display: flex; flex-direction: column; gap: 1vh; }
.lines { border-left: 0.5vh solid #f5b800; padding-left: 3vw; display: flex; flex-direction: column; gap: 2vh; }
.lines p, .line { margin: 0; font-size: 3.8vh; font-weight: 700; line-height: 1.35; }
.count { margin: 0; font-size: 4vh; font-weight: 600; color: var(--muted); }
.count strong { font-size: 9vh; color: var(--ink); }
.shares { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1.4vh; }
.shares li { display: grid; grid-template-columns: auto 1fr auto auto 22vw; align-items: center; gap: 2.4vw; padding: 1.6vh 2.4vw; background: var(--surface); border-radius: 1.6vh; font-size: 3.4vh; font-weight: 600; }
.shares .name { font-family: var(--font-display); font-size: 6vh; letter-spacing: -0.06em; }
.shares .alive, .shares .hold { color: var(--muted); }
.shares .share { text-align: right; font-size: 6vh; }
.shares li.excluded { opacity: 0.55; }
.shares li.excluded .share { font-size: 3.4vh; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .final { animation: none; } }
</style>
