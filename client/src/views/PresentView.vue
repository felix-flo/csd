<script setup lang="ts">
import Icon from '../components/Icon.vue'
/**
 * 프레젠테이션 (빔 출력). 준비 상태에서는 팀 입장 현황(A 3/5 …, 실제 팀 이름 비공개)과 접속 QR. 게임 중에는 일차·단계와 모든 팀 초기 재화 합계만 공개한다 (이후 변동은 비공개).
 * 모든 팀 리더 선출 / 라이프 제출 완료는 큰 알림으로. 최종장(docs/100 N2)에는 투표 인원 현황 → 득표 → 상금 화폐·마지막 라운드 발행량 → 정산을 크게 보여준다.
 * 게임 시작 후에는 팀 현황(팀별 팀원 명단, 리더, 탈락자 흐리게)도 보여준다. 재화는 공개하지 않는다.
 * 현황판 (docs/100 D5): 골드 발행 누적(마지막 라운드 전까지)과 오늘 전쟁 선포 비용·전쟁 상태. 보석 발행량은 공개하지 않는다.
 * 명단은 게임 상태가 갱신될 때마다(단계 전환, 팀 구성 변경 신호 lobby) 다시 받는다.
 * 제목: 시작 전에는 "스위칭데이"만. 게임 제목은 서버가 시작 후에만 보내고(state.title), 시작 순간 열려 있던 화면은 리졸브 효과로 공개한다.
 *       시작 후 새로 열거나 새로고침하면 효과 없이 바로 제목.
 * 오프닝 영상: 서버 data/media/intro.mp4 가 있으면 시작 순간 전체 화면으로 먼저 틀고, 끝난 뒤 제목 리졸브로 이어진다 (IntroVideo).
 *       재생 전 대기 카운트다운(기본 10초, URL ?intro=초 · ?intro=wait 는 클릭까지 대기)으로 관리자가 이 창으로 넘어올 시간을 준다.
 *       소리는 이 탭에서 한 번 클릭이 있어야 나므로 시작 전에 "영상 준비" 안내를 보여 준다 (대기 화면 클릭도 같은 효과).
 * 가시성 (docs/104): 이 화면이 떠 있는 동안 html[data-screen='present'] 를 켜서 루트 글자 크기 20px·진한 회색·뚜렷한 선을 쓴다 (style.css).
 *       멀리서 읽을 글자는 최소 1.3rem(26px), 핵심 숫자는 2rem 이상.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import AccessQr from '../components/AccessQr.vue'
import ResourceRow from '../components/ResourceRow.vue'
import ResultsBoard from '../components/ResultsBoard.vue'
import TeamMark from '../components/TeamMark.vue'
import ResolveText from '../components/ResolveText.vue'
import IntroVideo from '../components/IntroVideo.vue'
import { useRoute } from 'vue-router'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import { api } from '../lib/api'
import { isBeforeStart, PHASE_LABELS, RESOURCE_LABELS, WAR_COST_KINDS, WAR_STATUS_LABELS, type IntroResponse, type RosterTeam, type WarCost } from '../../../shared/game'

const game = useGameStore()
onMounted(() => void game.load())
const s = computed(() => game.state)

const PRE_TITLE = '스위칭데이'
// 상태를 받기 전(새로고침 직후)에는 비워 둔다 — 시작 후 새로고침에서 "스위칭데이" 가 잠깐 보이지 않게
const title = computed(() => (s.value ? s.value.title ?? PRE_TITLE : ''))
/** 시작 순간(시작 전 → 진행) 실시간으로 받았을 때만 올린다 → ResolveText 재생 */
const reveal = ref(0)
const revealing = ref(false)
/** 오프닝 영상 (있을 때만). 시작 순간 영상 → 끝나면 제목 리졸브 */
const intro = ref<string | null>(null)
const introPlay = ref(0)
/** 재생 전 대기 시간(초). URL ?intro=20 · ?intro=0 (바로) · ?intro=wait (클릭까지). 기본 10 */
const route = useRoute()
const introDelay = computed<number | 'wait'>(() => {
  const q = route.query.intro
  if (q === 'wait') return 'wait'
  const n = Number(q)
  return q != null && Number.isFinite(n) && n >= 0 ? n : 10
})
/** 이 탭에서 사용자 입력이 있었는지 — 없으면 영상 소리가 막히므로 안내를 보여 준다 */
const armed = ref(false)
function arm() { armed.value = true }
onMounted(async () => {
  document.documentElement.dataset.screen = 'present'
  window.addEventListener('pointerdown', arm, { once: true })
  window.addEventListener('keydown', arm, { once: true })
  try { intro.value = (await api.get<IntroResponse>('/api/game/intro')).url } catch { /* 없음으로 둔다 */ }
})
onBeforeUnmount(() => {
  delete document.documentElement.dataset.screen
  window.removeEventListener('pointerdown', arm)
  window.removeEventListener('keydown', arm)
})
function startReveal() {
  revealing.value = true
  reveal.value++
}
watch(() => s.value?.status, (now, before) => {
  if (before && isBeforeStart(before) && now && !isBeforeStart(now)) {
    if (intro.value) introPlay.value++
    else startReveal()
  }
})

const roster = ref<RosterTeam[]>([])
async function loadRoster() {
  if (!s.value || isBeforeStart(s.value.status)) {
    roster.value = []
    return
  }
  try {
    roster.value = (await api.get<{ teams: RosterTeam[] }>('/api/game/roster')).teams
  } catch { /* 다음 갱신 때 다시 */ }
}
watch(s, loadRoster, { immediate: true })
const alive = (t: RosterTeam) => t.members.filter((m) => !m.eliminated).length

// ---- 현황판: 골드 발행 누적 · 전쟁 (docs/100 D5) ----
const teams = useTeamsStore()
const nameOf = (id: number) => teams.byId(id)?.name ?? `#${id}`
const isLastRound = computed(() => !!s.value && s.value.status === 'running' && s.value.day >= (s.value.totalDays ?? 0))
const final = computed(() => (s.value?.status === 'final' || s.value?.status === 'ended' ? s.value.final : null))
/** 마지막 라운드 발행은 최종장 결과 발표 전까지 비공개 */
const lastHidden = computed(() => isLastRound.value || (!!final.value && !final.value.lastIssue))
const costText = (c: WarCost) => WAR_COST_KINDS.filter((k) => c[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${c[k]}`).join(', ') || '없음 (무료)'
/** 전쟁 줄: 선포 전 비용 → 전쟁 중 → 오늘 결과 */
const warLine = computed(() => {
  const w = s.value?.war
  if (!w || s.value?.status !== 'running') return null
  const pair = w.today ? `${nameOf(w.today.attacker)} → ${nameOf(w.today.defender)}` : ''
  if (w.today?.status === 'declared') return { text: `전쟁 중: ${pair}`, hot: true }
  if (w.today) return { text: `이번 라운드 전쟁: ${pair} · ${WAR_STATUS_LABELS[w.today.status]}`, hot: false }
  if (!w.allowed) return { text: '이번 라운드 전쟁 금지 (리더 협의)', hot: false }
  return { text: w.cost ? `이번 라운드 선포 비용: ${costText(w.cost)}` : '이번 라운드 선포 비용 미정', hot: false }
})
// ---- 단계 타이머 (docs/103 §14): 거래 15분 · 리더 협의 5분. 서버 시각으로 보정한 카운트다운 ----
const nowTick = ref(Date.now())
let tickHandle: ReturnType<typeof setInterval> | null = null
onMounted(() => { tickHandle = setInterval(() => (nowTick.value = Date.now()), 500) })
onBeforeUnmount(() => { if (tickHandle) clearInterval(tickHandle) })
/** 서버 시각 − 내 시계 (상태를 받을 때마다 갱신) */
const clockOffset = ref(0)
watch(() => s.value?.timer?.serverNow, (now) => { if (now) clockOffset.value = new Date(now).getTime() - Date.now() }, { immediate: true })
const timer = computed(() => {
  const t = s.value?.timer
  if (!t || s.value?.status !== 'running') return null
  const left = Math.max(0, Math.round((new Date(t.endsAt).getTime() - (nowTick.value + clockOffset.value)) / 1000))
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return { label: PHASE_LABELS[t.phase], text: `${mm}:${ss}`, left, over: left === 0, warn: left > 0 && left <= 60, ratio: left / t.seconds }
})

/** 리더 협의 단계 안건 (docs/103 §12): 원조 · 다음 라운드 전쟁 허용/제재 · (마지막 라운드) 라이프 투표권 */
const council = computed(() => {
  if (s.value?.status !== 'running' || s.value.phase !== 'council') return null
  const next = s.value.war?.nextAllowed
  return {
    warText: isLastRound.value ? null : next == null ? '협의 중' : next ? '허용' : '제재 (전쟁 금지)',
    lifeVote: isLastRound.value ? (s.value.lifeVote == null ? '협의 중' : s.value.lifeVote ? '통과' : '부결') : null,
  }
})
</script>

<template>
  <div class="page present">
    <IntroVideo :src="intro" :play="introPlay" :delay="introDelay" @done="startReveal" />
    <!-- 1줄: 제목 + 단계 표시줄 (TopBar 가 topbar·phase-bar 를 형제로 내므로 flex 로 한 줄에 놓는다) -->
    <div class="head">
      <TopBar :title="title" large>
        <template #title><ResolveText :text="title" :play="reveal" @done="revealing = false" /></template>
        <template #subtitle>
          <!-- v-if 로 비우면 TopBar 기본값(내 이름)이 나오므로 span 은 항상 둔다 -->
          <span class="subtitle" :class="{ hidden: revealing }">{{ s?.title ? 'for Switching Day' : '' }}</span>
        </template>
      </TopBar>
    </div>
    <ResultsBoard v-if="final" :final="final" :results="s?.results ?? null" large />
    <div v-if="final && final.step === 'vote' && !final.closed" class="card done-banner">
      <Icon name="vote" /> 최종 투표 중 · <span class="mono">{{ final.votes.done }} / {{ final.votes.eligible }}</span>명
      <span v-if="s?.lifeVote" class="muted sub">라이프 투표권 사용 가능</span>
    </div>
    <div v-if="s?.status === 'running' && (s.phase === 'leader' && s.leadersDone || s.phase === 'life' && s.livesDone)" class="card done-banner">
      {{ s.phase === 'leader' ? '모든팀의 리더 선출이 완료되었습니다.' : '모든 팀의 라이프가 제출되었습니다.' }}
    </div>

    <!-- 시작 전: 입장 현황(또는 초기 재화) 크게 + 접속 QR 크게 -->
    <div v-if="!s || isBeforeStart(s.status)" class="present-grid">
      <div v-if="s?.status === 'ready' && s.lobby" class="card span2">
        <h2>팀 입장 현황</h2>
        <div class="lobby">
          <div v-for="t in s.lobby" :key="t.teamId" class="lobby-team" :class="{ full: t.count >= t.capacity }">
            <span class="letter">{{ t.label }}</span>
            <span class="mono">{{ t.count }} / {{ t.capacity }}</span>
          </div>
        </div>
        <p class="muted note">QR 로 접속해 PIN 으로 로그인한 뒤 이름을 입력하고 팀을 고르세요.</p>
        <p v-if="intro" class="intro-note" :class="{ ok: armed }">
          <Icon name="film" /> 게임 시작 때 오프닝 영상을 틉니다{{ introDelay === 'wait' ? ' (클릭할 때까지 대기)' : introDelay ? ` (${introDelay}초 대기 후)` : '' }}.
          <template v-if="armed">소리 재생 준비됨.</template>
          <template v-else>소리를 내려면 이 화면을 한 번 클릭해 두세요. <button class="secondary" style="padding: 4px 12px; font-size: 0.9rem" @click="arm">영상 준비</button></template>
        </p>
      </div>
      <div v-else class="card span2">
        <h2>초기 재화 <span class="muted">모든 팀 합계</span></h2>
        <ResourceRow large show-label :amounts="s?.initialTotals" />
        <p class="muted note">게임 시작 시점의 전체 재화입니다. 이후 변동은 공개하지 않습니다.</p>
      </div>
      <div class="card">
        <h2>접속 주소</h2>
        <AccessQr />
      </div>
    </div>

    <!-- 시작 후 (docs/105): 2줄 타이머+안건, 3줄 팀 현황(남는 높이 차지), 4줄 작은 정보들. 알림 기록은 최근 3건만 -->
    <template v-else>
      <div v-if="timer || council" class="row2">
        <div v-if="timer" class="card timer bracket" :class="{ over: timer.over, warn: timer.warn }">
          <span class="t-label"><Icon name="timer" /> {{ timer.label }} 남은 시간</span>
          <span class="t-time mono">{{ timer.over ? '종료' : timer.text }}</span>
          <div class="t-bar"><div class="t-fill" :style="{ width: `${timer.ratio * 100}%` }" /></div>
        </div>
        <div v-if="council" class="card council bracket">
          <h2><Icon name="council" /> 리더 협의 안건 <span class="muted">결과는 진행자에게 알려 주세요</span></h2>
          <ul>
            <li><Icon name="aid" /> <strong>원조</strong> <span class="muted">대가 없는 재화 양도 · 라운드당 1건 · 리더 4명 중 3명 찬성</span></li>
            <li v-if="council.warText"><Icon name="war" /> <strong>다음 라운드 전쟁 허용 / 제재</strong> <span class="muted">제재면 다음 라운드 선포 불가</span> → <strong class="result">{{ council.warText }}</strong></li>
            <li v-if="council.lifeVote"><Icon name="scroll" /> <strong>남은 라이프를 최종 투표권으로 인정할까요?</strong> → <strong class="result">{{ council.lifeVote }}</strong></li>
          </ul>
        </div>
      </div>
      <div v-if="roster.length" class="card roster-card">
        <h2>팀 현황</h2>
        <div class="roster">
          <div v-for="t in roster" :key="t.teamId" class="roster-team" :style="{ '--team': t.color }">
            <div class="roster-head">
              <span class="name"><TeamMark :color="t.color" size="lg" />{{ t.name }}</span>
              <span class="mono count">{{ alive(t) }} / {{ t.members.length }}</span>
            </div>
            <ul>
              <li v-for="(m, i) in t.members" :key="i" :class="{ out: m.eliminated }">
                {{ m.name }} <span v-if="m.isLeader" class="badge on">리더</span><span v-if="m.eliminated" class="muted"> 탈락</span>
              </li>
              <li v-if="t.members.length === 0" class="muted">팀원 없음</li>
            </ul>
          </div>
        </div>
      </div>
      <div class="row4">
        <div class="card board">
          <h2>현황판</h2>
          <p class="gold"><Icon name="gold" /> 골드 발행 누적 <strong class="mono">{{ s.goldIssued ?? 0 }}</strong>개</p>
          <p v-if="lastHidden" class="muted small">마지막 라운드 발행은 최종장 결과 발표 때 공개</p>
          <p v-if="warLine" class="war" :class="{ hot: warLine.hot }"><Icon name="war" /> {{ warLine.text }}</p>
        </div>
        <div class="card initial">
          <h2>초기 재화 <span class="muted">모든 팀 합계 · 이후 변동 비공개</span></h2>
          <ResourceRow show-label :amounts="s.initialTotals" />
        </div>
        <div class="card qr-small">
          <h2>접속 주소</h2>
          <AccessQr />
        </div>
        <EventFeed plain :limit="3" class="feed-card" />
      </div>
    </template>
  </div>
</template>

<style scoped>
/*
 * 빔 투사용 배치 (docs/105). 루트 20px 이므로 1rem = 20px.
 * 세로를 아끼는 순서: 제목+단계 한 줄 → 타이머+안건 한 줄 → 팀 현황(남는 높이) → 작은 정보 한 줄. 1080p·720p 모두 스크롤 없이.
 */
.present { max-width: none; min-height: 100vh; display: flex; flex-direction: column; gap: 10px; padding: 10px 18px 12px; }
.present :deep(.card) { margin-bottom: 0; padding: 12px 18px; }
.note { margin: 12px 0 0; font-size: 1.1rem; }
/* 1줄: 제목(왼쪽) + 단계 표시줄(오른쪽). 전쟁 줄은 한 줄 전체 */
.head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 20px; }
.head :deep(.topbar) { flex: 1 1 480px; margin: 0; padding: 0; border-bottom: 0; align-items: center; }
.head :deep(.topbar h1) { font-size: 2rem; }
.head :deep(.topbar .row) { gap: 6px; }
.head :deep(.topbar button), .head :deep(.topbar .badge) { font-size: 0.7rem; padding: 3px 8px; }
.head :deep(.phase-bar) { flex: 0 1 auto; margin: 0; padding: 6px 12px; }
.head :deep(.phase-bar .now strong) { font-size: 1.8rem; }
.head :deep(.phase-bar .day) { font-size: 1.1rem; }
.head :deep(.war-bar) { flex-basis: 100%; margin: 0; }
/* 시작 전 */
.present-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: start; }
.present-grid .span2 { grid-column: span 2; }
@media (max-width: 900px) { .present-grid { grid-template-columns: 1fr; } .present-grid .span2 { grid-column: auto; } }
.lobby { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.lobby-team { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px; border: 2px solid var(--line); border-radius: var(--radius); font-size: 1.6rem; background: var(--bg-soft); }
.lobby-team.full { opacity: 0.4; }
.lobby-team .letter { font-family: var(--font-display); font-weight: 900; font-stretch: 125%; font-size: 4rem; line-height: 1; color: var(--blue); text-shadow: 0 0 18px var(--glow); }
.intro-note { margin: 12px 0 0; font-size: 1.1rem; color: var(--blue); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.intro-note.ok { color: var(--muted); }
.subtitle { transition: opacity 0.8s ease; }
.subtitle.hidden { opacity: 0; transition: none; }
/* 2줄: 타이머(1/3) + 안건(2/3). 하나만 있으면 전체 폭 */
.row2 { display: grid; grid-template-columns: minmax(360px, 1fr) 2fr; gap: 10px; }
.row2 > :only-child { grid-column: 1 / -1; }
.timer { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; position: relative; border-left: 6px solid var(--blue); }
.timer .t-label { font-size: 1.4rem; color: var(--muted); }
/* 타이머 숫자: 디스플레이 폰트 + LED 글로우 (docs/106) */
.timer .t-time { font-family: var(--font-display); font-weight: 900; font-stretch: 125%; font-size: 3.6rem; line-height: 1; font-variant-numeric: tabular-nums; color: var(--blue); text-shadow: 0 0 18px var(--glow); }
.timer.warn .t-time { color: var(--red); text-shadow: 0 0 18px rgba(255, 77, 77, 0.4); }
.timer.over { border-left-color: var(--red); background: var(--red-bg); }
.timer.over .t-time { color: var(--red); font-size: 2.8rem; }
.t-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; background: var(--bg-soft); }
.t-fill { height: 100%; background: var(--blue); transition: width 0.5s linear; }
.timer.warn .t-fill { background: var(--red); }
.council { border-left: 6px solid var(--blue); }
.council h2 { font-size: 1.3rem; margin-bottom: 6px; }
.council h2 .muted { font-size: 0.85rem; }
.council ul { list-style: none; margin: 0; padding: 0; font-size: 1.4rem; line-height: 1.4; }
.council li { padding: 4px 0; }
.council li .muted { font-size: 1rem; }
.council .result { color: var(--green); }
/* 3줄: 팀 현황 — 남는 높이를 차지한다 */
.roster-card { flex: 1 0 auto; }
.roster { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 1000px) { .roster { grid-template-columns: repeat(2, 1fr); } }
.roster-team { border: 2px solid var(--line-soft); border-top: 6px solid var(--team, var(--line)); border-radius: var(--radius); padding: 10px 14px; background: var(--bg-soft); }
.roster-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.roster-head .name { font-family: var(--font-display); font-weight: 900; font-stretch: 125%; font-size: 1.8rem; }
.roster-head .count { font-size: 1.3rem; }
.roster-team ul { list-style: none; margin: 0; padding: 0; font-size: 1.3rem; }
.roster-team li { padding: 3px 0; border-top: 1px solid var(--line-soft); }
.roster-team li.out { color: var(--muted); text-decoration: line-through; }
/* 4줄: 현황판 · 초기 재화 · QR(작게) · 최근 알림 3건 */
.row4 { display: grid; grid-template-columns: auto auto auto 1fr; gap: 10px; align-items: stretch; }
.row4 h2 { font-size: 1.1rem; margin-bottom: 6px; }
.row4 h2 .muted { font-size: 0.75rem; }
.board .gold { margin: 0; font-size: 1.2rem; }
.board .gold strong { font-family: var(--font-display); font-weight: 900; font-stretch: 125%; font-size: 1.8rem; color: var(--res-gold-fg); }
.board .small { margin: 2px 0 0; font-size: 0.85rem; }
.board .war { margin: 6px 0 0; font-size: 1.2rem; }
.board .war.hot { color: var(--red); font-weight: 700; font-size: 1.5rem; }
.initial :deep(.res-row) { gap: 6px; }
.qr-small :deep(.qr) { flex-direction: row; text-align: left; gap: 10px; }
.qr-small :deep(.qr-box) { width: 96px; padding: 3px; }
.qr-small :deep(.qr-url) { font-size: 0.9rem; }
.qr-small :deep(.qr .muted) { display: none; }
.feed-card { min-width: 0; }
.feed-card :deep(h2) { font-size: 1.1rem; }
.feed-card :deep(button.small) { font-size: 0.7rem; padding: 2px 8px; }
/* 한 건을 한 줄로: 범위 뱃지 · 시각 · 메시지(넘치면 …) */
.feed-card :deep(.feed li) { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; min-width: 0; }
.feed-card :deep(.feed .msg) { margin: 0; flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 720p 급 (폭 1400 이하): 제목·단계를 한 줄에 맞추고 글자를 한 단계 줄인다. 4줄은 현황판 + 초기 재화만 (QR·알림 기록은 숨김) */
@media (max-width: 1400px) {
  .present { gap: 8px; padding: 8px 14px 10px; }
  .present :deep(.card) { padding: 10px 16px; }
  .head :deep(.topbar h1) { font-size: 1.6rem; }
  .head :deep(.phase-bar .now strong) { font-size: 1.4rem; }
  .head :deep(.phase-bar .day .muted) { display: none; }
  .head :deep(.phase-bar .steps li) { font-size: 0.8rem; padding: 2px 10px; }
  .row2 { gap: 8px; }
  .timer .t-time { font-size: 2.8rem; }
  .timer .t-label { font-size: 1.1rem; }
  .council h2 { font-size: 1.1rem; margin-bottom: 2px; }
  .council ul { font-size: 1.15rem; }
  .council li { padding: 2px 0; }
  .council li .muted { font-size: 0.85rem; }
  .roster-card h2 { font-size: 1.2rem; margin-bottom: 6px; }
  .roster { gap: 8px; }
  .roster-team { padding: 6px 12px; }
  .roster-head { margin-bottom: 2px; }
  .roster-head .name { font-size: 1.35rem; }
  .roster-head .count { font-size: 1rem; }
  .roster-team ul { font-size: 1.05rem; }
  .roster-team li { padding: 1px 0; }
  .row4 { grid-template-columns: auto 1fr; gap: 8px; }
  .row4 .qr-small, .row4 .feed-card { display: none; }
  .row4 h2 { font-size: 1rem; margin-bottom: 4px; }
  .board .gold { font-size: 1rem; }
  .board .gold strong { font-size: 1.4rem; }
  .board .war { font-size: 1rem; margin-top: 2px; }
  .board .war.hot { font-size: 1.2rem; }
}
.done-banner .sub { font-size: 1.3rem; margin-left: 8px; }
.done-banner { font-family: var(--font-display); font-weight: 900; font-stretch: 125%; font-size: 2.2rem; line-height: 1.2; border-left: 6px solid var(--green); }
</style>

