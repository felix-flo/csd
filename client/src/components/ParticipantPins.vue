<script setup lang="ts">
/**
 * 참가자 PIN (게임 시작 전). 초기셋팅완료로 만든 PIN 은 팀에 묶여 있지 않으므로 팀 명단과 따로 보여준다.
 * - 상태: 대기(한 번도 로그인 안 함) → 접속함(로그인함, 이름 전) → 이름 입력함(팀 선택 전) → A 팀 배정
 * - 로그인·이름 입력·팀 선택 때 서버가 lobby 신호를 보내 관리자 화면이 계정 목록을 다시 받으므로 실시간으로 바뀐다.
 * - 테스트 계정은 팀이 미리 정해져 있어 여기서 빼고 계정 관리의 "테스트 계정" 묶음에 둔다.
 */
import { computed, ref } from 'vue'
import type { AdminUser, GroupInfo } from '../../../shared/types'
import { isBeforeStart, teamLetter } from '../../../shared/game'
import { useGameStore } from '../stores/game'

const props = defineProps<{ users: AdminUser[]; groups: GroupInfo[] }>()
const game = useGameStore()
const showPins = ref(true)
const message = ref('')

type PinState = 'waiting' | 'connected' | 'named' | 'joined'
const STATE_LABEL: Record<PinState, string> = { waiting: '대기', connected: '접속함', named: '이름 입력함', joined: '배정' }

// 만든 순서(id)로 고정: 팀을 골라도 번호가 바뀌지 않게
const pins = computed(() => props.users.filter((u) => u.role === 'member' && !u.isTest).sort((a, b) => a.id - b.id))
function stateOf(u: AdminUser): PinState {
  if (u.groupId != null) return 'joined'
  if (u.nameSet) return 'named'
  if (u.lastLoginAt) return 'connected'
  return 'waiting'
}
const counts = computed(() => {
  const c: Record<PinState, number> = { waiting: 0, connected: 0, named: 0, joined: 0 }
  for (const u of pins.value) c[stateOf(u)]++
  return c
})
const letterOf = (teamId: number | null) => {
  const i = props.groups.findIndex((g) => g.id === teamId)
  return i < 0 ? '' : teamLetter(i)
}
const teamName = (teamId: number | null) => props.groups.find((g) => g.id === teamId)?.name ?? ''

function copyPins() {
  const lines = pins.value.map((u, i) => `${i + 1}\t${u.pin ?? ''}`)
  navigator.clipboard?.writeText(lines.join('\n')).then(
    () => { message.value = `PIN ${pins.value.length}개를 복사했습니다` },
    () => { message.value = '복사 실패' },
  )
}
</script>

<template>
  <div v-if="isBeforeStart(game.admin?.state.status) && pins.length > 0" class="card">
    <h2>참가자 PIN</h2>
    <p class="muted">
      PIN 은 팀에 묶여 있지 않습니다. 아무 PIN 이나 나눠 주면 참가자가 로그인해 이름을 입력하고 팀을 직접 고릅니다.
      <template v-if="game.admin?.state.status === 'setup'"> 지금은 설정 단계라 참가자가 팀을 고를 수 없습니다.</template>
    </p>
    <div class="row summary">
      <span>PIN {{ pins.length }}개</span>
      <span class="badge">대기 {{ counts.waiting }}</span>
      <span class="badge warn">접속함 {{ counts.connected }}</span>
      <span class="badge warn">이름 입력함 {{ counts.named }}</span>
      <span class="badge on">배정 {{ counts.joined }}</span>
      <span class="spacer" />
      <button class="secondary small" type="button" @click="showPins = !showPins">{{ showPins ? 'PIN 숨기기' : 'PIN 보기' }}</button>
      <button class="secondary small" type="button" @click="copyPins">PIN 목록 복사</button>
    </div>
    <p v-if="message" class="muted" style="margin: 4px 0 0">{{ message }}</p>

    <div class="pins">
      <div v-for="(u, i) in pins" :key="u.id" class="pin" :class="[stateOf(u), { inactive: !u.active }]">
        <span class="no muted">{{ i + 1 }}</span>
        <span class="code mono">{{ showPins ? u.pin : '••••' }}</span>
        <span class="state">
          <template v-if="stateOf(u) === 'joined'"><strong>{{ letterOf(u.groupId) }}</strong> 팀 <span class="muted">({{ teamName(u.groupId) }})</span></template>
          <template v-else>{{ STATE_LABEL[stateOf(u)] }}</template>
        </span>
        <span class="name">{{ u.nameSet ? u.name : '' }}<span v-if="!u.active" class="badge off">탈락</span></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary { align-items: center; gap: 6px; }
.spacer { flex: 1; }
.pins { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 6px; margin-top: 10px; }
.pin {
  display: grid;
  grid-template-columns: 1.8em auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 8px;
  align-items: baseline;
  padding: 6px 10px;
  border: 1px solid var(--line-soft);
  border-left: 3px solid var(--line);
  border-radius: var(--radius);
  font-size: 0.9rem;
}
.pin.connected, .pin.named { border-left-color: var(--yellow, #f5c518); }
.pin.joined { border-left-color: var(--blue); background: var(--bg-soft); }
.pin.inactive { opacity: 0.5; }
.no { font-size: 0.75rem; }
.code { font-size: 1.05rem; letter-spacing: 0.15em; }
.state { text-align: right; font-size: 0.85rem; }
.name { grid-column: 2 / 4; font-size: 0.85rem; min-height: 1em; }
button.small { padding: 4px 10px; font-size: 0.85rem; }
</style>
