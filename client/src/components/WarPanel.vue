<script setup lang="ts">
/**
 * 전쟁 선포 (거래 활동 단계, 리더만). 하루에 게임 전체 1회, 진행 중 전쟁이 있으면 선포할 수 없다.
 * 상대 팀을 고르고 "전쟁 선포" → 확인 팝업(비용·되돌릴 수 없음) → 오늘 비용(보석·골드·크레딧)을 내면 선포된다.
 * 낸 비용은 소멸하고, 결과가 나올 때까지 모든 팀 거래가 멈춘다. 승패는 진행자가 오프라인 게임 결과로 정한다.
 */
import { computed, ref } from 'vue'
import { RESOURCE_LABELS, WAR_COST_KINDS, type Resources } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import TeamMark from './TeamMark.vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{ myTeamId: number; isLeader: boolean; resources: Resources }>()
const game = useGameStore()
const teams = useTeamsStore()
const target = ref<number | null>(null)
const busy = ref(false)
const error = ref('')
const confirmOpen = ref(false)

const war = computed(() => game.state?.war)
const cost = computed(() => war.value?.cost ?? null)
const others = computed(() => teams.teams.filter((t) => t.id !== props.myTeamId))
const nameOf = (id: number | null | undefined) => teams.byId(id)?.name ?? ''
const costText = computed(() => {
  const c = cost.value
  if (!c) return '-'
  return WAR_COST_KINDS.filter((k) => c[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${c[k]}`).join(', ') || '없음 (무료)'
})
const short = computed(() => {
  const c = cost.value
  return c ? WAR_COST_KINDS.filter((k) => props.resources[k] < c[k]) : []
})
const blocker = computed(() => {
  if (war.value?.active) return '전쟁이 진행 중입니다.'
  if (war.value?.usedToday) return '이번 라운드에는 이미 전쟁이 선포되었습니다 (라운드당 1회).'
  if (!cost.value) return '이번 라운드 선포 비용이 정해지지 않았습니다.'
  if (short.value.length) return `${short.value.map((k) => RESOURCE_LABELS[k]).join(', ')}이(가) 부족해 선포할 수 없습니다.`
  return ''
})

async function declare() {
  if (target.value == null) return
  busy.value = true
  error.value = ''
  try {
    await api.post('/api/war/declare', { defenderId: target.value })
    target.value = null
  } catch (e) {
    error.value = e instanceof ApiError && e.detail ? e.detail : `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
    confirmOpen.value = false
    void game.load()
  }
}
</script>

<template>
  <div class="card war-card">
    <h2>⚔️ 전쟁</h2>
    <p v-if="war?.active" class="active">
      <strong>전쟁 중: {{ nameOf(war.active.attacker) }} → {{ nameOf(war.active.defender) }}</strong><br />
      진행자가 오프라인 게임으로 승패를 정합니다. 결과가 나올 때까지 모든 거래가 멈춥니다.
    </p>
    <template v-else>
      <p class="muted">
        이번 라운드 선포 비용: <strong>{{ costText }}</strong> · 라운드에 한 번, 먼저 선포한 팀만. 낸 비용은 돌려받지 못하고,
        선포하면 결과가 나올 때까지 모든 팀이 거래할 수 없습니다. 이기면 상대 팀 재화의 절반을 가져옵니다.
      </p>
      <template v-if="isLeader && !blocker">
        <div class="teams">
          <button
            v-for="t in others"
            :key="t.id"
            type="button"
            class="secondary team-btn"
            :class="{ on: target === t.id }"
            :disabled="busy"
            @click="target = t.id"
          >
            <TeamMark :color="t.color" />{{ t.name }}
          </button>
        </div>
        <button class="danger" style="margin-top: 8px" :disabled="busy || target == null" @click="confirmOpen = true">전쟁 선포</button>
      </template>
      <p v-else-if="blocker" class="muted">{{ blocker }}</p>
      <p v-else class="muted">리더가 전쟁을 선포할 수 있습니다.</p>
    </template>
    <p v-if="error" class="error">{{ error }}</p>

    <ModalDialog
      :open="confirmOpen"
      :title="`${nameOf(target)}에 전쟁을 선포할까요?`"
      :message="`선포 비용 ${costText}을(를) 냅니다. 낸 비용은 돌려받지 못합니다.\n선포하면 되돌릴 수 없고, 결과가 나올 때까지 모든 팀이 거래할 수 없습니다.`"
      confirm-label="전쟁 선포"
      cancel-label="취소"
      danger
      :busy="busy"
      @confirm="declare"
      @cancel="confirmOpen = false"
    />
  </div>
</template>

<style scoped>
.war-card { border-left: 3px solid var(--red); }
.active { color: var(--red); margin: 0; }
.teams { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px; }
.team-btn { text-align: left; padding: 10px 12px; }
.team-btn.on { border-color: var(--red); box-shadow: inset 0 0 0 1px var(--red); }
</style>
