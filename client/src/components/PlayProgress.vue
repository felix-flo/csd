<script setup lang="ts">
/**
 * 진행 영역 (docs/107): 제목 줄(라운드·남은 시간), 단계 바(한 사각형을 화살표로 나눈다. 칸 색이 종료·활성·대기), 지금 할 일 안내.
 * 전쟁 중에는 안내 자리에 "전쟁 중" 띠를 보여 준다.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import DigitalClock from './DigitalClock.vue'
import type { PublicUser } from '../../../shared/types'
import { FINAL_STEP_LABELS, FINAL_STEPS, isLifeExempt, PHASES, RESOURCE_LABELS, type FinalStep, type Phase } from '../../../shared/game'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import { shortTeamName } from '../lib/teamTheme'

const props = defineProps<{ members: PublicUser[]; myTeamId: number | null }>()
const auth = useAuthStore()
const game = useGameStore()
const teams = useTeamsStore()
const s = computed(() => game.state)
const isLeader = computed(() => !!auth.user?.isLeader)
const nameOf = (id: number | null | undefined) => shortTeamName(teams.byId(id)?.name)

const SHORT: Record<Phase, string> = { leader: '리더', production: '생산', trade: '거래', council: '협의', life: '라이프' }
const FINAL_SHORT: Record<FinalStep, string> = { vote: '투표', result: '결과', settle: '정산', spy: '테러리스트' }

const steps = computed(() => {
  const st = s.value
  if (st?.status === 'running' && st.phase) {
    const now = PHASES.indexOf(st.phase)
    return PHASES.map((p, i) => ({ key: p, label: SHORT[p], state: i < now ? 'done' : i === now ? 'now' : 'wait' }))
  }
  if (st?.final) {
    // "테러리스트 공개" 칸은 그 단계가 되기 전까지 숨긴다 (docs/103 §13). 네 칸이 되면 짧은 이름으로
    const flow = FINAL_STEPS.filter((f) => f !== 'spy' || st.final!.step === 'spy')
    const labels = flow.length > 3 ? FINAL_SHORT : FINAL_STEP_LABELS
    const now = st.status === 'ended' ? flow.length : flow.indexOf(st.final.step)
    return flow.map((f, i) => ({ key: f, label: labels[f], state: i < now ? 'done' : i === now ? 'now' : 'wait' }))
  }
  return []
})

const war = computed(() => (s.value?.status === 'running' ? s.value.war?.active ?? null : null))

/** 지금 할 일 안내: main 한 줄 + 보조 줄 */
const guide = computed<{ main: string; sub?: string }>(() => {
  const st = s.value
  const team = game.team
  if (!st) return { main: '' }
  if (st.status === 'ended') return { main: '게임이 끝났습니다. 수고하셨습니다' }
  if (st.status === 'final' && st.final) {
    const f = st.final
    const progress = `투표 ${f.votes.done} / ${f.votes.eligible}명`
    if (f.step !== 'vote') return { main: `${FINAL_STEP_LABELS[f.step]} 중입니다` }
    if (f.closed) return { main: '투표가 마감되었습니다. 결과 발표를 기다리세요' }
    if (team?.myFinalVote) return { main: `${RESOURCE_LABELS[team.myFinalVote.choice]}에 투표했습니다`, sub: progress }
    if (isLeader.value) return { main: '상금이 될 화폐에 투표해 주세요', sub: progress }
    if (st.lifeVote && (team?.resources.life ?? 0) > 0) return { main: '라이프 투표권으로 투표할 수 있습니다', sub: progress }
    return { main: '리더가 투표합니다', sub: progress }
  }
  switch (st.phase) {
    case 'leader': {
      const leader = props.members.find((m) => m.isLeader)
      if (team?.election?.status === 'done') return { main: `이번 라운드 리더: ${leader?.name ?? '-'}` }
      return { main: '팀에서 리더를 정해 진행자에게 알려 주세요', sub: leader ? `현재 리더: ${leader.name}` : undefined }
    }
    case 'production':
      return { main: '미니게임 결과로 재화를 지급받습니다' }
    case 'trade': {
      const t = team?.trade
      if (t && props.myTeamId != null) {
        const mine = t.from.teamId === props.myTeamId ? t.from : t.to
        const partner = nameOf(t.from.teamId === props.myTeamId ? t.to.teamId : t.from.teamId)
        if (!isLeader.value) return { main: `리더가 ${partner} 팀과의 거래를 확인 중입니다` }
        return { main: mine.accepted ? '상대 리더의 수락을 기다리는 중입니다' : `${partner} 팀과의 거래를 확인해 주세요` }
      }
      return { main: '거래는 협의한 뒤 진행자에게 가서 진행합니다' }
    }
    case 'council':
      if (st.day >= (st.totalDays ?? Infinity)) {
        const r = st.lifeVote == null ? '' : st.lifeVote ? ' · 통과' : ' · 부결'
        return { main: '리더들이 오프라인에서 협의합니다', sub: `필수 안건: 남은 라이프를 최종 투표권으로 인정할까요?${r}` }
      }
      return { main: '리더들이 오프라인에서 협의합니다' }
    case 'life': {
      const sub = team?.lifeSubmission
      if (sub) {
        const names = (ids: number[]) => ids.map((id) => sub.names[id] ?? `#${id}`).join(', ')
        const lost = sub.eliminated.length ? ` · 탈락: ${names(sub.eliminated)}` : ''
        return { main: `라이프 ${sub.livesUsed}개 사용${sub.selfEliminated ? ' · 리더 자진 탈락' : ''}`, sub: `생존: ${names(sub.saved) || '없음'}${lost}` }
      }
      if (team && isLifeExempt(props.members.length, team.resources.life)) return { main: '라이프 제출 없이 그대로 생존합니다' }
      return { main: isLeader.value ? '살릴 인원 수를 정해 제출해 주세요' : '리더가 살릴 인원 수를 정하는 중입니다' }
    }
    default:
      return { main: '' }
  }
})

// ---- 단계 타이머 (docs/103 §14): 서버 시각으로 보정한 카운트다운 ----
const nowTick = ref(Date.now())
let tickHandle: ReturnType<typeof setInterval> | null = null
onMounted(() => { tickHandle = setInterval(() => (nowTick.value = Date.now()), 500) })
onBeforeUnmount(() => { if (tickHandle) clearInterval(tickHandle) })
const clockOffset = ref(0)
watch(() => s.value?.timer?.serverNow, (now) => { if (now) clockOffset.value = new Date(now).getTime() - Date.now() }, { immediate: true })
const timer = computed(() => {
  const t = s.value?.timer
  if (!t || s.value?.status !== 'running') return null
  const left = Math.max(0, Math.round((new Date(t.endsAt).getTime() - (nowTick.value + clockOffset.value)) / 1000))
  return { text: `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`, warn: left <= 60 }
})
</script>

<template>
  <section class="area progress">
    <h2 class="ttl">
      <template v-if="s?.status === 'running'">진행 <b>{{ s.day }} / {{ s.totalDays }} R</b></template>
      <template v-else>최종장</template>
      <DigitalClock v-if="timer" class="time" :class="{ warn: timer.warn }" :text="timer.text" />
    </h2>
    <ol v-if="steps.length" class="bar">
      <li v-for="st in steps" :key="st.key" :class="st.state" :aria-current="st.state === 'now' ? 'step' : undefined">{{ st.label }}</li>
    </ol>
    <div v-if="war" class="warbar" role="status"><Icon name="war" />전쟁 중: {{ nameOf(war.attacker) }} → {{ nameOf(war.defender) }} · 모든 거래 중지</div>
    <p v-else-if="guide.main" class="guide">{{ guide.main }}<small v-if="guide.sub">{{ guide.sub }}</small></p>
  </section>
</template>

<style scoped>
.ttl b { position: relative; top: -2px; font: 900 24px/1 'Archivo', sans-serif; font-variant-numeric: tabular-nums; }
.time { position: relative; top: -2px; margin-left: auto; }
.time.warn { --led: #ff4d4d; }
.bar { display: flex; height: 46px; margin: 0; padding: 0; list-style: none; background: #050608; border: 2px solid #6a7283; overflow: hidden; }
.bar li { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; margin-left: -9px; padding: 3px 12px 0; font-family: var(--font-play); font-size: clamp(16px, 5vw, 19px); line-height: 1; white-space: nowrap; color: #a3abb8; background: #23262e; clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%); }
.bar li:first-child { margin-left: 0; padding-left: 0; clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%); }
.bar li:last-child { padding-right: 0; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%); }
.bar li.done { color: #fff; background: var(--done); }
.bar li.now { color: var(--accent-fg); background: var(--accent); font-size: clamp(18px, 5.6vw, 22px); }
.guide { margin: 8px 0 0; padding: 0 12px; font-size: 17px; font-weight: 700; line-height: 24px; word-break: keep-all; }
.guide small { display: block; font-size: 14.5px; font-weight: 600; line-height: 20px; }
.warbar { display: flex; align-items: center; gap: 8px; min-height: 38px; margin-top: 8px; padding: 4px 12px; background: #d4141c; color: #fff; font-size: 15px; font-weight: 800; line-height: 1.25; }
.warbar :deep(.icon) { font-size: 20px; }
</style>
