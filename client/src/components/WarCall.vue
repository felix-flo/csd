<script setup lang="ts">
/**
 * 전쟁 전체 화면. 선포가 들어온 순간 모든 화면을 덮는다.
 * 결과가 나오면 전쟁 종료 화면(검은 바탕에 칼)으로 바뀌고, 재화가 넘어간 것을 보여 준다. 수량은 두 팀 휴대폰에만 나온다.
 * 휴대폰은 관리자가 리더 협의로 넘길 때까지 닫을 수 없다. 프레젠테이션(large)은 화면을 눌러 닫을 수 있다.
 * 문장은 원작 분위기를 따라 새로 그린 그림이다.
 */
import { computed, ref, watch } from 'vue'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import { josa, RESOURCE_KINDS, RESOURCE_LABELS, warStage, warWinner, type Resources } from '../../../shared/game'

const props = defineProps<{ large?: boolean }>()
const game = useGameStore()
const teams = useTeamsStore()
const stage = computed(() => warStage(game.state))
const war = computed(() => game.state?.war?.today ?? null)
const seen = ref<typeof stage.value>(null)
const open = computed(() => !!stage.value && (!props.large || seen.value !== stage.value))
function onClick() {
  if (props.large) seen.value = stage.value
}
watch(stage, (st) => { if (!st) seen.value = null })
const teamName = (id: number) => teams.byId(id)?.name ?? ''
const nameOf = (id: number) => teamName(id).replace(/ 팀$/, '')

const winner = computed(() => (war.value ? warWinner(war.value) : 0))
const loser = computed(() => (war.value?.attacker === winner.value ? war.value?.defender ?? 0 : war.value?.attacker ?? 0))
const amounts = (spoils: Resources) => RESOURCE_KINDS.filter((k) => spoils[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${spoils[k]}`).join(', ')
/** 어떤 재화가 넘어갔는지. 수량은 승패 팀에게만 */
const spoilsText = computed(() => {
  const mine = !props.large ? game.team?.warResult : null
  if (!mine) return `${teamName(loser.value)} 보석·라이프·크레딧 절반이 ${teamName(winner.value)}으로 넘어갔습니다`
  const text = amounts(mine.spoils)
  if (mine.won) return text ? `가져온 재화: ${text}` : '가져온 재화가 없습니다'
  return text ? `빼앗긴 재화: ${text}` : '빼앗긴 재화가 없습니다'
})
</script>

<template>
  <div v-if="open && war" class="war-call" :class="{ large, ended: stage === 'over' }" role="alertdialog" :aria-label="stage === 'over' ? '전쟁 종료' : '전쟁 선포'" @click="onClick">
    <div class="body">
      <svg class="emblem" viewBox="0 0 300 360" fill="#fff" aria-hidden="true"><g class="sword right" transform="translate(150 178) rotate(40)"><path d="M0-186 7-168V96H-7V-168Z"/><path d="M0-168V96" class="ink-line" stroke="#7A0A04" stroke-width="1.2" fill="none"/><path d="M-34 96H34V104H-34Z"/><rect x="-4.500" y="104" width="9" height="34"/><path d="M0 138l8 8-8 8-8-8z"/></g><g class="sword left" transform="translate(150 178) rotate(-40)"><path d="M0-186 7-168V96H-7V-168Z"/><path d="M0-168V96" class="ink-line" stroke="#7A0A04" stroke-width="1.2" fill="none"/><path d="M-34 96H34V104H-34Z"/><rect x="-4.500" y="104" width="9" height="34"/><path d="M0 138l8 8-8 8-8-8z"/></g><path d="M183.4 319.9A138 138 0 0 0 258.7 101.0" fill="none" stroke="#fff" stroke-width="1.6"/><path transform="translate(197.2 315.7) rotate(36.0) scale(1.00)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(197.2 315.7) rotate(104.0) scale(1.00)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(220.0 304.9) rotate(25.5) scale(0.97)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(220.0 304.9) rotate(93.5) scale(0.97)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(240.5 290.1) rotate(15.0) scale(0.94)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(240.5 290.1) rotate(83.0) scale(0.94)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(258.0 271.9) rotate(4.5) scale(0.91)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(258.0 271.9) rotate(72.5) scale(0.91)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(271.8 250.8) rotate(-6.0) scale(0.88)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(271.8 250.8) rotate(62.0) scale(0.88)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(281.6 227.5) rotate(-16.5) scale(0.85)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(281.6 227.5) rotate(51.5) scale(0.85)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(287.0 202.8) rotate(-27.0) scale(0.82)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(287.0 202.8) rotate(41.0) scale(0.82)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(287.7 177.6) rotate(-37.5) scale(0.79)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(287.7 177.6) rotate(30.5) scale(0.79)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(283.9 152.6) rotate(-48.0) scale(0.76)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(283.9 152.6) rotate(20.0) scale(0.76)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(275.6 128.8) rotate(-58.5) scale(0.73)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(275.6 128.8) rotate(9.5) scale(0.73)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(263.0 106.8) rotate(-69.0) scale(0.70)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(263.0 106.8) rotate(-1.0) scale(0.70)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path d="M116.6 319.9A138 138 0 0 1 41.3 101.0" fill="none" stroke="#fff" stroke-width="1.6"/><path transform="translate(102.8 315.7) rotate(-104.0) scale(1.00)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(102.8 315.7) rotate(-36.0) scale(1.00)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(80.0 304.9) rotate(-93.5) scale(0.97)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(80.0 304.9) rotate(-25.5) scale(0.97)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(59.5 290.1) rotate(-83.0) scale(0.94)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(59.5 290.1) rotate(-15.0) scale(0.94)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(42.0 271.9) rotate(-72.5) scale(0.91)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(42.0 271.9) rotate(-4.5) scale(0.91)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(28.2 250.8) rotate(-62.0) scale(0.88)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(28.2 250.8) rotate(6.0) scale(0.88)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(18.4 227.5) rotate(-51.5) scale(0.85)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(18.4 227.5) rotate(16.5) scale(0.85)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(13.0 202.8) rotate(-41.0) scale(0.82)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(13.0 202.8) rotate(27.0) scale(0.82)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(12.3 177.6) rotate(-30.5) scale(0.79)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(12.3 177.6) rotate(37.5) scale(0.79)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(16.1 152.6) rotate(-20.0) scale(0.76)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(16.1 152.6) rotate(48.0) scale(0.76)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(24.4 128.8) rotate(-9.5) scale(0.73)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(24.4 128.8) rotate(58.5) scale(0.73)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(37.0 106.8) rotate(1.0) scale(0.70)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path transform="translate(37.0 106.8) rotate(69.0) scale(0.70)" d="M0 0Q6.500-11 0-24Q-6.500-11 0 0Z"/><path d="M150 74C182 92 212 96 232 94V174C232 234 192 270 150 290 108 270 68 234 68 174V94C88 96 118 92 150 74Z" class="ink" fill="#7A0A04" stroke="#fff" stroke-width="3"/><path d="M150 84C180 100 206 104 222 102V174C222 226 186 260 150 278 114 260 78 226 78 174V102C94 104 120 100 150 84Z" fill="none" stroke="#fff" stroke-width="1"/><g transform="translate(150 182) scale(.92)"><path d="M0-104C7-92 8-82 7-72H-7C-8-82-7-92 0-104Z"/><path d="M0-74C44-74 66-42 66-2V28C66 50 52 66 28 86L20 92C18 70 18 40 18 40H-18C-18 40-18 70-20 92L-28 86C-52 66-66 50-66 28V-2C-66-42-44-74 0-74Z"/><polygon class="ink" fill="#7A0A04" points="0.0,36.0 7.0,30.0 7.0,-13.0 48.0,-27.0 45.0,-9.0 19.0,8.0 19.0,100.0 0.0,100.0 -19.0,100.0 -19.0,8.0 -45.0,-9.0 -48.0,-27.0 -7.0,-13.0 -7.0,30.0"/><path d="M-58-40C-30-54 30-54 58-40M0-74V-50" fill="none" class="ink-line" stroke="#7A0A04" stroke-width="2.4"/><path d="M52 16C50 34 42 46 32 56M-52 16C-50 34-42 46-32 56" fill="none" class="ink-line" stroke="#7A0A04" stroke-width="2"/></g></svg>
      <template v-if="stage === 'over'">
        <h1>전쟁 종료</h1>
        <p class="who">{{ josa(teamName(winner), '이/가') }} 승리했습니다</p>
        <p class="note">{{ spoilsText }}</p>
      </template>
      <template v-else>
        <h1>전쟁 선포</h1>
        <p class="who">{{ nameOf(war.attacker) }} → {{ nameOf(war.defender) }}</p>
        <p class="note">이번 라운드 거래는 종료되었습니다</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.war-call { position: fixed; inset: 0; z-index: 2000; display: flex; flex-direction: column; color: #fff; background: radial-gradient(ellipse at 50% 42%, #8e0c05 0%, #5a0703 42%, #160302 88%); padding: 24px 16px calc(28px + env(safe-area-inset-bottom)); }
.body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 10px; }
.emblem { width: min(56vw, 44vh); height: auto; }
h1 { color: #fff; font-size: 4.2rem; margin: 4px 0 0; }
.who { margin: 0; font-size: 1.35rem; font-weight: 800; }
.note { margin: 0; color: #f0d9d5; }
.large .emblem { width: auto; height: 40vh; }
.large h1 { font-size: 9.5rem; line-height: 1.05; }
.large { cursor: pointer; }
.ended { background: #0d0d0d; }
.ended .emblem { overflow: visible; }
.ended .sword.left { transform: translate(30px, 178px); }
.ended .sword.right { transform: translate(270px, 178px); }
/* 월계수 잎 테두리를 배경색으로 둘러 칼이 잎 뒤로 지나가 보이게 한다 */
.ended .emblem > path:not([stroke]) { stroke: #0d0d0d; stroke-width: 2.5; }
.ended .ink { fill: #0d0d0d; }
.ended .ink-line { stroke: #0d0d0d; }
/* 칼은 테두리만 선으로 */
.ended .sword > * { fill: #0d0d0d; stroke: #fff; stroke-width: 1.6; }
.ended .sword > .ink-line { stroke: none; }
.large .who { font-size: 2.6rem; }
.large .note { font-size: 1.5rem; }
.ended .note { color: #fff; font-size: 1.1rem; font-weight: 700; }
.large.ended .note { font-size: 2rem; }
</style>
