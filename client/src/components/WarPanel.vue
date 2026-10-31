<script setup lang="ts">
/**
 * 전쟁 선포 (거래 단계, 리더만). 라운드당 게임 전체 1회, 진행 중 전쟁이 있으면 선포할 수 없다.
 * 상대 팀을 고르고 "전쟁 선포" → 확인 팝업 → 즉시 비용(보석·골드·크레딧)이 빠지고 전쟁이 시작된다 (docs/103 §4, 승인 단계 없음).
 * 두 팀이 동시에 선포하면 먼저 들어온 쪽만 유효. 리더 협의로 금지된 라운드면 선포할 수 없다 (docs/103 §12).
 * 낸 비용은 소멸하고, 결과가 나올 때까지 모든 팀 거래가 멈춘다. 승패는 진행자가 오프라인 게임 결과로 정하고, 정해지면 리더 협의로 넘어간다.
 */
import { computed, ref } from 'vue'
import type { Resources } from '../../../shared/game'
import { api, ApiError } from '../lib/api'
import { warBlocker, warCostText } from '../lib/warBlocker'
import { shortTeamName } from '../lib/teamTheme'
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
const others = computed(() => teams.teams.filter((t) => t.id !== props.myTeamId))
const nameOf = (id: number | null | undefined) => teams.byId(id)?.name ?? ''
const costText = computed(() => warCostText(war.value))
const blocker = computed(() => warBlocker(war.value, props.resources))

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
  <div class="card">
    <h2>전쟁 선포</h2>
    <p v-if="war?.active" class="hint active">
      <strong>전쟁 중: {{ nameOf(war.active.attacker) }} → {{ nameOf(war.active.defender) }}</strong><br />
      진행자가 오프라인 게임으로 승패를 정합니다. 결과가 나올 때까지 모든 거래가 멈추고, 결과가 나오면 리더 협의로 넘어갑니다.
    </p>
    <template v-else>
      <div class="lines">
        <div class="line"><span>선포 비용</span>{{ costText }}<em>돌려받지 못함</em></div>
        <div class="line"><span>이기면</span>상대 팀 재화의 절반</div>
      </div>
      <p class="hint">라운드에 한 번, 먼저 선포한 팀만 할 수 있습니다. 결과가 나올 때까지 모든 팀이 거래할 수 없습니다.</p>
      <template v-if="isLeader && !blocker">
        <div class="picks war-picks">
          <button v-for="t in others" :key="t.id" type="button" class="pick" :class="{ on: target === t.id }" :disabled="busy" @click="target = t.id">
            <TeamMark :color="t.color" />{{ shortTeamName(t.name) }}
          </button>
        </div>
        <button class="danger wide" type="button" :disabled="busy || target == null" @click="confirmOpen = true">{{ target == null ? '상대 팀을 고르세요' : `${nameOf(target)}에 전쟁 선포` }}</button>
      </template>
      <p v-else-if="blocker" class="hint blocked">{{ blocker }}</p>
      <p v-else class="hint">리더가 전쟁을 선포할 수 있습니다.</p>
    </template>
    <p v-if="error" class="error">{{ error }}</p>

    <ModalDialog
      :open="confirmOpen"
      :title="`${nameOf(target)}에 전쟁을 선포할까요?`"
      :message="`선포 즉시 비용 ${costText}을(를) 내고(돌려받지 못함) 전쟁이 시작됩니다.\n선포하면 되돌릴 수 없고, 전쟁 중에는 결과가 나올 때까지 모든 팀이 거래할 수 없습니다.`"
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
.active, .blocked { color: #ff6b6b; }
.war-picks .pick.on, .war-picks .pick.on:hover { background: #d4141c; border-color: #d4141c; color: #fff; }
</style>
