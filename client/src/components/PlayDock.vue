<script setup lang="ts">
/**
 * 하단 버튼 (docs/107): 지금 단계에서 누를 수 있는 일만 보여 준다. 누를 것이 없으면 사라진다.
 * 거래·전쟁·라이프 제출·최종 투표는 단계에 묶이고, 이주는 시작 라운드부터 라이프 제출 전까지 열린다.
 */
import { computed } from 'vue'
import Icon from './Icon.vue'
import type { IconName } from './Icon.vue'
import type { PublicUser } from '../../../shared/types'
import { isLifeExempt, PHASE_LABELS } from '../../../shared/game'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import { shortTeamName } from '../lib/teamTheme'
import { warBlocker, warCostText } from '../lib/warBlocker'

export type DockAction = 'trade' | 'war' | 'life' | 'vote' | 'migration'

const props = defineProps<{ members: PublicUser[]; myTeamId: number | null }>()
const emit = defineEmits<{ open: [DockAction] }>()
const auth = useAuthStore()
const game = useGameStore()
const teams = useTeamsStore()
const s = computed(() => game.state)
const team = computed(() => game.team)
const isLeader = computed(() => !!auth.user?.isLeader)

interface Item { key: DockAction; label: string; icon: IconName; hot?: boolean; war?: boolean; off?: boolean; note?: string }

const phaseItems = computed<Item[]>(() => {
  const st = s.value
  const t = team.value
  if (!st || !t) return []
  const items: Item[] = []
  if (st.status === 'final' && st.final?.step === 'vote' && !st.final.closed && !t.myFinalVote) {
    if (isLeader.value || (st.lifeVote && t.resources.life > 0)) items.push({ key: 'vote', label: '최종 투표', icon: 'vote', hot: true })
  }
  if (st.status !== 'running' || !isLeader.value) return items
  if (st.phase === 'trade') {
    if (t.trade && props.myTeamId != null) {
      const mine = t.trade.from.teamId === props.myTeamId ? t.trade.from : t.trade.to
      items.push({ key: 'trade', label: mine.accepted ? '거래 현황' : '거래 확인', icon: 'aid', hot: !mine.accepted })
    }
    if (!st.war.active) {
      const why = warBlocker(st.war, t.resources)
      items.push({ key: 'war', label: '전쟁 선포', icon: 'war', war: true, off: !!why, note: why || `이번 라운드 선포 비용: ${warCostText(st.war)}` })
    }
  }
  if (st.phase === 'life' && !t.lifeSubmission && !isLifeExempt(props.members.length, t.resources.life)) {
    items.push({ key: 'life', label: '라이프 제출', icon: 'life', hot: true })
  }
  return items
})

const migration = computed<Item | null>(() => {
  const st = s.value
  const m = team.value?.migration
  if (!st || !m || st.status !== 'running' || st.day < m.startDay) return null
  if (isLeader.value) return m.open && m.incoming.length ? { key: 'migration', label: `이주 ${m.incoming.length}건`, icon: 'migration', note: '우리 팀으로 온 이주 신청이 있습니다' } : null
  if (m.done) return null
  if (m.mine) return { key: 'migration', label: '이주 대기', icon: 'migration', note: `${shortTeamName(teams.byId(m.mine.toTeamId)?.name)} 팀에 이주 신청 중입니다` }
  return m.open ? { key: 'migration', label: '이주', icon: 'migration', note: '다른 팀으로 옮길 수 있습니다' } : null
})

const items = computed(() => [...phaseItems.value, ...(migration.value ? [migration.value] : [])])

const title = computed(() => {
  const st = s.value
  if (!phaseItems.value.length) return '할 수 있는 일'
  if (st?.status === 'final') return '최종장에서 할 일'
  return st?.phase ? `${PHASE_LABELS[st.phase]} 단계에서 할 일` : '할 수 있는 일'
})
/** 강조할 일 없이 버튼 하나뿐이면 설명과 함께 한 줄로 */
const single = computed(() => (items.value.length === 1 && !items.value[0]!.hot ? items.value[0]! : null))
</script>

<template>
  <section v-if="items.length" class="area dock">
    <h2 class="ttl">{{ title }}</h2>
    <div v-if="single" class="line">
      <p>{{ single.note }}</p>
      <button class="act" :class="{ war: single.war }" type="button" :disabled="single.off" @click="emit('open', single.key)"><Icon :name="single.icon" />{{ single.label }}</button>
    </div>
    <div v-else class="acts">
      <button v-for="a in items" :key="a.key" class="act" :class="{ hot: a.hot, war: a.war }" type="button" :disabled="a.off" @click="emit('open', a.key)"><Icon :name="a.icon" />{{ a.label }}</button>
    </div>
  </section>
</template>

<style scoped>
.dock { position: sticky; bottom: 12px; z-index: 5; margin-top: auto; background: #101216; }
.acts { display: flex; gap: 6px; }
.act { flex: 1 1 0; min-width: 0; height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 0 2px; background: none; border: 2px solid #6a7283; color: #f4f6fa; font-size: 14px; font-weight: 800; letter-spacing: 0; line-height: 1.15; text-transform: none; }
.act:hover { background: none; border-color: #6a7283; color: #f4f6fa; }
.act :deep(.icon) { font-size: 20px; }
.act.hot { flex: 2 1 0; flex-direction: row; gap: 6px; background: var(--accent); border-color: var(--accent); color: var(--accent-fg); font-size: 18px; }
.act.hot:hover { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
.act.hot :deep(.icon) { font-size: 22px; color: inherit; }
.act.war { border-color: #ff6b6b; color: #ff6b6b; }
.act.war:hover { border-color: #ff6b6b; color: #ff6b6b; }
.act:disabled { opacity: 0.45; }
.line { display: flex; align-items: center; gap: 8px; padding-left: 12px; }
.line p { flex: 1 1 0; min-width: 0; margin: 0; font-size: 16px; font-weight: 700; line-height: 1.3; word-break: keep-all; }
.line .act { flex: 0 0 84px; height: 50px; }
@media (prefers-reduced-motion: no-preference) {
  .act.hot { animation: hot-pulse 1.4s ease-in-out infinite; }
}
@keyframes hot-pulse { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 35%, transparent); } }
</style>
