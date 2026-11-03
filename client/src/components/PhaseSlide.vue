<script setup lang="ts">
/**
 * 단계 공지 (프레젠테이션). 1라운드에만 단계가 바뀔 때 화면을 덮어 지금 할 일을 알린다. 10초 뒤 저절로 사라지고, 누르면 바로 닫힌다.
 * leaders 는 리더가 모두 정해진 순간 네 팀 리더를 공개한다.
 */
import type { Phase, RosterTeam } from '../../../shared/game'
import { useTeamsStore } from '../stores/teams'
import Crest from './Crest.vue'

defineProps<{ kind: Phase | 'leaders'; day: number; roster: RosterTeam[] }>()
defineEmits<{ close: [] }>()
const teams = useTeamsStore()
const RATES = [
  { code: 'white', name: '화이트', life: '2승마다 1개', credit: '2승마다 1개' },
  { code: 'yellow', name: '골드', life: '2승마다 1개', credit: '2승마다 1개' },
  { code: 'blue', name: '블루', life: '1승마다 2개', credit: '3승마다 1개' },
  { code: 'red', name: '레드', life: '2승마다 1개', credit: '1승마다 3개' },
]
const leaderOf = (t: RosterTeam) => t.members.find((m) => m.isLeader)?.name ?? ''
</script>

<template>
  <div class="slide" :class="{ dark: kind === 'leaders' }" role="status" @click="$emit('close')">
    <template v-if="kind === 'leaders'">
      <p class="kicker">{{ day }}라운드 리더</p>
      <div class="leaders">
        <div v-for="t in roster" :key="t.teamId" class="leader">
          <Crest :team="teams.byId(t.teamId)?.code" size="22vh" light />
          <p class="name">{{ leaderOf(t) }}</p>
          <p class="team">{{ t.name }}</p>
        </div>
      </div>
    </template>
    <template v-else-if="kind === 'leader'">
      <p class="kicker">{{ day }}라운드</p>
      <h1>지금부터 리더 선출을<br />시작합니다.</h1>
      <div class="lines">
        <p>각 팀은 리더 1명을 선출하십시오.</p>
        <p>리더는 매 라운드 팀원들의 합의를 통해 연임 또는 교체가 결정됩니다.</p>
      </div>
    </template>
    <template v-else-if="kind === 'production'">
      <p class="kicker">{{ day }}라운드</p>
      <h1>생산게임</h1>
      <div class="lines pipgrid">
        <div class="pipline"><div class="pips" aria-hidden="true"><i v-for="n in 10" :key="n" /></div><p>참가비 크레딧 1개 · 기본 10판</p></div>
        <div class="pipline"><div class="pips" aria-hidden="true"><b v-for="n in 3" :key="n" /></div><p>크레딧 1개당 1판 추가 · 최대 3판</p></div>
      </div>
      <table>
        <thead><tr><th /><th>라이프</th><th>크레딧</th></tr></thead>
        <tbody><tr v-for="r in RATES" :key="r.code"><td><Crest :team="r.code" size="5vh" />{{ r.name }}</td><td>{{ r.life }}</td><td>{{ r.credit }}</td></tr></tbody>
      </table>
    </template>
    <template v-else-if="kind === 'trade'">
      <p class="kicker">{{ day }}라운드</p>
      <h1>지금부터 거래를<br />시작합니다.</h1>
      <div class="lines"><p class="flow">두 팀 협의 <span>→</span> 운영진에게 <span>→</span> 거래 완료</p><p>수수료 크레딧 1개</p></div>
    </template>
    <template v-else-if="kind === 'council'">
      <p class="kicker">{{ day }}라운드 · 리더 협의</p>
      <h1>각 팀의 리더는 앞으로 나와<br />안건을 진행해주세요.</h1>
    </template>
    <template v-else>
      <p class="kicker">{{ day }}라운드</p>
      <h1>지금부터 라이프를<br />제출합니다.</h1>
      <div class="lines">
        <p>제출한 라이프 수만큼 생존합니다.</p>
        <p>리더는 생존, 나머지는 무작위입니다.</p>
        <p>리더는 스스로 생존을 포기할 수 있습니다.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.slide { position: fixed; inset: 0; z-index: 1400; background: var(--bg); color: var(--ink); display: flex; flex-direction: column; justify-content: center; gap: 3.4vh; padding: 0 8vw; animation: fade-in 0.4s ease both; cursor: pointer; }
.slide.dark { background: #0d0d0d; color: #fff; align-items: center; }
.kicker { margin: 0; font-size: 3vh; font-weight: 700; color: var(--muted); }
.dark .kicker { color: #c9c7c1; }
h1 { font-size: 11vh; line-height: 1.16; margin: 0; }
.lines { border-left: 0.5vh solid #f5b800; padding-left: 3vw; display: flex; flex-direction: column; gap: 2vh; }
.lines p { margin: 0; font-size: 3.8vh; font-weight: 700; line-height: 1.35; }
.flow span { color: var(--muted); font-weight: 400; margin: 0 0.8vw; }
.leaders { display: grid; grid-template-columns: repeat(4, 1fr); width: 100%; margin-top: 3vh; }
.leader { display: flex; flex-direction: column; align-items: center; gap: 1vh; }
.name { margin: 2.4vh 0 0; font-family: var(--font-display); font-size: 8vh; letter-spacing: -0.04em; line-height: 1.2; }
.team { margin: 0; font-size: 2.8vh; color: #c9c7c1; font-weight: 600; }
.pips { display: flex; align-items: center; gap: 0.5vw; }
.pips i, .pips b { width: 3.4vh; height: 3.4vh; border-radius: 0.8vh; }
.pips i { background: var(--ink); }
.pips b { box-shadow: inset 0 0 0 2px var(--blue); }
.pipgrid { display: grid; grid-template-columns: auto 1fr; gap: 2vh 2vw; align-items: center; }
.pipline { display: contents; }
table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 1.6vh; overflow: hidden; font-size: 3.2vh; font-weight: 600; }
th { text-align: left; padding: 1.6vh 2.4vw; font-size: 2.4vh; color: var(--muted); }
td { padding: 1.3vh 2.4vw; border-top: 1px solid var(--line-soft); }
td:first-child { display: flex; align-items: center; gap: 1.2vw; font-weight: 700; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .slide { animation: none; } }
</style>
