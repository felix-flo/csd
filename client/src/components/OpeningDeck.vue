<script setup lang="ts">
/**
 * 오프닝 화면 (프레젠테이션). 진행자가 넘기는 대로 영상 뒤 로고 → 룰 설명 → 점심시간을 보여 준다.
 * 글자는 사람이 말로 설명하는 것을 돕는 정도로만 둔다.
 */
import { PHASE_LABELS, PHASES, type OpeningStep, type Resources } from '../../../shared/game'
import BrandLogo from './BrandLogo.vue'
import Crest from './Crest.vue'
import ResourceRow from './ResourceRow.vue'

defineProps<{ step: OpeningStep; filmDone: boolean; totals?: Resources }>()
</script>

<template>
  <div class="deck" :class="step">
    <div v-if="step === 'film'" class="film">
      <div v-if="filmDone" class="logo">
        <Crest all light size="9vh" />
        <BrandLogo height="13vh" unfold />
        <p>보이지 않는 손</p>
      </div>
    </div>

    <div v-else-if="step === 'world'" class="pg">
      <h1>4개의 팀.<br />6번의 라운드.<br />단 하나의 화폐.</h1>
      <p class="line">여러분은 6라운드 동안 재화를 벌고, 거래하고, 때로는 전쟁을 벌입니다.</p>
    </div>

    <div v-else-if="step === 'blue'" class="pg team">
      <Crest team="blue" size="20vh" />
      <p class="who blue">블루</p>
      <h1 class="word">생존</h1>
      <p class="line">생존을 위해서는 매 라운드 라이프를 제출해야 합니다.</p>
    </div>

    <div v-else-if="step === 'red'" class="pg team">
      <Crest team="red" size="20vh" />
      <p class="who red">레드</p>
      <h1 class="word">진행</h1>
      <p class="line">생산게임, 거래, 전쟁을 하려면 크레딧을 내야 합니다.</p>
    </div>

    <div v-else-if="step === 'money'" class="pg team">
      <div class="pair"><Crest team="white" size="20vh" /><Crest team="yellow" size="20vh" /></div>
      <p class="who">화이트와 골드</p>
      <h1 class="word">상금</h1>
      <p class="line">상금이 되는 보석과 골드는 화이트와 골드만 발행할 수 있습니다.</p>
    </div>

    <div v-else-if="step === 'vote'" class="pg">
      <h1>최종 투표에서 선택된<br />화폐만 상금이 됩니다.</h1>
      <p class="line">보석인가, 골드인가.</p>
    </div>

    <div v-else-if="step === 'round'" class="pg">
      <p class="kicker">한 라운드</p>
      <h1>매 라운드, 같은 순서로<br />진행됩니다.</h1>
      <ol class="flow">
        <li v-for="p in PHASES" :key="p">{{ p === 'trade' ? '거래 · 전쟁' : PHASE_LABELS[p] }}</li>
      </ol>
      <div class="track"><span>6라운드</span><i v-for="n in 6" :key="n" /><i class="end" /><span class="end">최종장</span></div>
    </div>

    <div v-else-if="step === 'stock'" class="pg">
      <p class="kicker">초기 재화</p>
      <h1>모든 팀 합계로<br />게임을 시작합니다.</h1>
      <ResourceRow class="totals" large show-label :amounts="totals" />
      <p class="line">우리 팀 재화는 휴대폰에서 확인해 주세요.</p>
    </div>

    <div v-else class="pg">
      <p class="kicker">점심시간</p>
      <h1>팀별로 식사하며<br />전략을 세워 주세요.</h1>
      <p class="line">식사 후 1라운드 리더 선출을 시작합니다.</p>
    </div>

    <div v-if="step !== 'film'" class="foot"><Crest all size="3.4vh" /><BrandLogo height="3.6vh" /></div>
  </div>
</template>

<style scoped>
.deck { position: fixed; inset: 0; z-index: 1500; background: var(--bg); color: var(--ink); display: flex; }
.deck.film { background: #000; color: #fff; }
.film { flex: 1; display: flex; align-items: center; justify-content: center; }
.logo { display: flex; flex-direction: column; align-items: center; gap: 3vh; animation: fade-in 2s ease-in-out both; }
.logo p { margin: 0; font-size: 2.8vh; letter-spacing: 0.3em; padding-left: 0.3em; color: #c9c7c1; }
.pg { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 4vh; padding: 0 9vw; animation: fade-in 0.5s ease both; }
.pg h1 { font-size: 13vh; line-height: 1.16; margin: 0; }
.pg.team { gap: 2vh; }
.pair { display: flex; gap: 3vw; }
.who { margin: 2vh 0 0; font-size: 3.6vh; font-weight: 700; }
.who.blue { color: var(--blue); }
.who.red { color: #c9220f; }
.pg h1.word { font-size: 19vh; letter-spacing: -0.04em; line-height: 1.2; }
.line { margin: 0; font-size: 3.8vh; font-weight: 600; line-height: 1.4; }
.kicker { margin: 0; font-size: 3vh; font-weight: 700; color: var(--muted); }
.flow { list-style: none; margin: 2vh 0 0; padding: 0; display: flex; align-items: center; flex-wrap: nowrap; gap: 1vw; font-size: 3.8vh; font-weight: 700; white-space: nowrap; }
.flow li + li::before { content: '→'; margin-right: 1vw; color: var(--muted); font-weight: 400; }
.track { display: flex; align-items: center; gap: 1vw; font-size: 2.8vh; font-weight: 700; }
.track i { width: 5vw; height: 1.6vh; border-radius: 1vh; background: var(--ink); }
.track i.end { background: #f5b800; }
.track .end { color: var(--amber); }
.totals { gap: 1.4vw; }
.totals :deep(.res) { font-size: 4.4vh; padding: 1.4vh 1.6vw; gap: 0.8vw; }
.totals :deep(.res-amount) { font-size: 1.3em; }
.foot { position: absolute; right: 4vw; bottom: 3.6vh; display: flex; align-items: center; gap: 0.8vw; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .logo, .pg { animation: none; } }
</style>
