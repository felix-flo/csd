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
 *       관리자가 세팅 완료를 누르면 검은 화면에 "게임 진행" 버튼이 뜨고, 이 버튼을 눌러야 재생한다 (이 클릭이 소리 허용 조건도 겸한다).
 * 가시성 (docs/104): 이 화면이 떠 있는 동안 html[data-screen='present'] 를 켜서 루트 글자 크기 20px·진한 회색·뚜렷한 선을 쓴다 (style.css).
 *       멀리서 읽을 글자는 최소 1.3rem(26px), 핵심 숫자는 2rem 이상.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import GamePhaseBar from '../components/GamePhaseBar.vue'
import { teamInk } from '../lib/teamColor'
import AccessQr from '../components/AccessQr.vue'
import ResourceRow from '../components/ResourceRow.vue'
import FinalStage from '../components/FinalStage.vue'
import TeamMark from '../components/TeamMark.vue'
import ResolveText from '../components/ResolveText.vue'
import Crest from '../components/Crest.vue'
import BrandLogo from '../components/BrandLogo.vue'
import WarCall from '../components/WarCall.vue'
import OpeningDeck from '../components/OpeningDeck.vue'
import PhaseSlide from '../components/PhaseSlide.vue'
import FullNotice from '../components/FullNotice.vue'
import { useNoticeStore } from '../stores/notices'
import { usePhaseTimer } from '../lib/phaseTimer'
import { fadeVolume } from '../lib/fade'
import IntroVideo from '../components/IntroVideo.vue'
import { useRoute } from 'vue-router'
import { useGameStore } from '../stores/game'
import { useTeamsStore } from '../stores/teams'
import { api } from '../lib/api'
import { isBeforeStart, phaseLabel, RESOURCE_LABELS, WAR_COST_KINDS, warStage, warWinner, type IntroResponse, type Phase, type RosterTeam, type WarCost } from '../../../shared/game'

const game = useGameStore()
onMounted(() => void game.load())
const s = computed(() => game.state)

const PRE_TITLE = '스위칭데이'
// 상태를 받기 전(새로고침 직후)에는 비워 둔다 — 시작 후 새로고침에서 "스위칭데이" 가 잠깐 보이지 않게
const title = computed(() => (s.value ? s.value.title ?? PRE_TITLE : ''))
/** 시작 순간(시작 전 → 진행) 실시간으로 받았을 때만 올린다 → ResolveText 재생 */
const reveal = ref(0)
/** 영상이 끝나 로고를 보여도 되는지. 새로고침으로 들어오면 바로 로고 */
const filmDone = ref(true)
/** 전체 화면 알림: 단계 공지·리더 공개·전쟁 종료·그 밖의 알림. 화면을 눌러야 다음으로 넘어간다 */
const notices = useNoticeStore()
const overlay = computed(() => notices.queue[0] ?? null)
const noticeLines = computed(() => (overlay.value?.type === 'notice' ? overlay.value.message.split('\n') : []))
// 단계 공지는 1라운드에만. 그 뒤로는 현황판만 보여 준다
watch(() => (s.value?.status === 'running' && !s.value.opening ? `${s.value.day}:${s.value.phase}` : null), (now, before) => {
  if (!now || before === undefined || !s.value?.phase) return
  notices.clearStage()
  // 전쟁 결과로 넘어간 리더 협의는 전쟁 종료 화면이 공지를 대신한다
  const afterWar = s.value.phase === 'council' && !!s.value.war?.today
  if (s.value.day === 1 && !afterWar) notices.enqueue({ type: 'phase', phase: s.value.phase })
})
// 단계 공지와 AUTO_CLOSE 공지(이주 시작·수락, 마지막 라운드, 탈락자)는 10초 뒤 저절로 사라져 현황판을 보여 준다
let slideTimer: ReturnType<typeof setTimeout> | null = null
watch(overlay, (o) => {
  if (slideTimer) clearTimeout(slideTimer)
  slideTimer = o?.type === 'phase' || (o?.type === 'notice' && o.auto) ? setTimeout(() => notices.next(), 10_000) : null
})
watch(() => s.value?.status === 'running' && s.value.phase === 'leader' && !s.value.opening && s.value.leadersDone, (done, was) => {
  if (done && was === false) void loadRoster().then(() => notices.enqueue({ type: 'leaders' }))
})
const revealing = ref(false)
/** 오프닝 영상 (있을 때만). 시작 순간 영상 → 끝나면 제목 리졸브 */
const intro = ref<string | null>(null)
const introPlay = ref(0)
/** 재생 전 대기. 기본은 "게임 진행" 버튼을 누를 때까지. URL ?intro=20 은 20초 뒤 재생, ?intro=0 은 바로 재생 */
const route = useRoute()
const introDelay = computed<number | 'wait'>(() => {
  const q = route.query.intro
  const n = Number(q)
  return q != null && q !== 'wait' && Number.isFinite(n) && n >= 0 ? n : 'wait'
})
onMounted(async () => {
  document.documentElement.dataset.screen = 'present'
  try { intro.value = (await api.get<IntroResponse>('/api/game/intro')).url } catch { /* 없음으로 둔다 */ }
})
onBeforeUnmount(() => {
  music.pause()
  delete document.documentElement.dataset.screen
})
/** 영상이 끝난 뒤 로고 화면에서 반복 재생하고, 관리자가 다음으로 넘기면 멈춘다 */
const music = new Audio('/media/intro_music.mp3')
music.loop = true
watch(() => s.value?.opening, (step) => {
  if (step === 'film') return
  music.pause()
  music.currentTime = 0
})
function startReveal() {
  if (s.value?.opening === 'film') {
    music.volume = 0
    void music.play().then(() => fadeVolume(music, 1, 4000)).catch(() => { /* 파일이 없거나 소리가 막히면 음악 없이 진행 */ })
  }
  revealing.value = true
  reveal.value++
}
watch(() => s.value?.status, (now, before) => {
  if (before && isBeforeStart(before) && now && !isBeforeStart(now)) {
    if (intro.value) { filmDone.value = false; introPlay.value++ }
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
/** 1라운드 리더가 정해지기 전에는 리더를 따로 보여 주지 않는다 */
const leaderShown = computed(() => !(s.value?.status === 'running' && s.value.day === 1 && s.value.phase === 'leader' && !s.value.leadersDone))
const leaderOf = (t: RosterTeam) => (leaderShown.value ? t.members.find((m) => m.isLeader) : undefined)
const othersOf = (t: RosterTeam) => t.members.filter((m) => m !== leaderOf(t))
const stageTitle = computed(() => {
  const st = s.value
  if (!st?.phase) return ''
  const war = warStage(st)
  if (war) return war === 'war' ? '전쟁 중' : '전쟁 종료'
  return st.phase === 'trade' ? '거래 시간' : phaseLabel(st.phase, st.day)
})
/** 휴대폰과 같은 한 줄 안내 */
const stageGuide = computed(() => {
  const st = s.value
  if (!st?.phase) return ''
  if (warStage(st)) return '이번 라운드 거래는 종료되었습니다'
  const guides: Record<Phase, string> = {
    leader: st.day > 1 ? '재신임할지 교체할지 정해 진행자에게 알려 주세요' : '팀에서 리더 1명을 정해 진행자에게 알려 주세요',
    production: '진행요원과의 게임 결과에 따라 재화가 지급됩니다',
    trade: '거래는 진행자에게 가서 진행합니다',
    council: '각 팀의 리더는 앞으로 나와 안건을 진행해주세요',
    last_issue: '화이트와 골드는 지금 마지막으로 발행할 수 있습니다',
    life: '리더가 살릴 인원 수를 정하고 있습니다',
  }
  return guides[st.phase]
})

// ---- 현황판: 골드 발행 누적 · 전쟁 (docs/100 D5) ----
const teams = useTeamsStore()
const nameOf = (id: number) => teams.byId(id)?.name ?? `#${id}`
const isLastRound = computed(() => !!s.value && s.value.status === 'running' && s.value.day >= (s.value.totalDays ?? 0))
const final = computed(() => (s.value?.status === 'final' || s.value?.status === 'ended' ? s.value.final : null))
/** 마지막 라운드 발행은 최종장 결과 발표 전까지 비공개 */
const costText = (c: WarCost) => WAR_COST_KINDS.filter((k) => c[k] > 0).map((k) => `${RESOURCE_LABELS[k]} ${c[k]}개`).join(', ') || '없음 (무료)'
/** 전쟁 줄: 선포 전 비용 → 전쟁 중 → 오늘 결과 */
const warLine = computed(() => {
  const w = s.value?.war
  if (!w || s.value?.status !== 'running') return null
  const short = (id: number) => nameOf(id).replace(/ 팀$/, '')
  const pair = w.today ? `${short(w.today.attacker)} → ${short(w.today.defender)}` : ''
  if (w.today?.status === 'declared') return { label: '전쟁 중', value: pair, hot: true }
  if (w.today) return { label: '이번 라운드 전쟁', value: `${pair} · ${short(warWinner(w.today))} 승리`, hot: false }
  if (!w.allowed) return { label: '이번 라운드 전쟁', value: '금지', hot: false }
  return { label: '전쟁 선포 비용', value: w.cost ? costText(w.cost) : '미정', hot: false }
})
const timer = usePhaseTimer()

/** 리더 협의 단계 안건 (docs/103 §12): 원조 · 다음 라운드 전쟁 제재(전쟁 제재 금지가 켜져 있으면 없음) · (마지막 라운드) 라이프 투표권 */
const council = computed(() => {
  if (s.value?.status !== 'running' || s.value.phase !== 'council') return null
  const next = s.value.war?.nextAllowed
  return {
    warText: isLastRound.value || s.value.war?.sanctionOff ? null : next === false ? '제재 (전쟁 금지)' : '기본 허용 · 리더 3명 이상 제재 찬성 시 금지',
    lifeVote: isLastRound.value ? (s.value.lifeVote ? '기본으로 반영 · 리더 3명이 반대하면 미반영' : '미반영 (리더 3명 반대)') : null,
  }
})
</script>

<template>
  <div class="page present" :class="{ pre: !s || isBeforeStart(s.status), revealing }">
    <IntroVideo :src="intro" :play="introPlay" :delay="introDelay" @done="filmDone = true; startReveal()" />
    <WarCall large />
    <OpeningDeck v-if="s?.opening" :step="s.opening" :film-done="filmDone" :totals="s.initialTotals" />
    <template v-else-if="overlay && s && overlay.type !== 'phase'">
      <PhaseSlide v-if="overlay.type === 'leaders'" kind="leaders" :day="s.day" :roster="roster" @close="notices.next()" />
      <FullNotice v-else kicker="공지" :title="noticeLines[0] ?? ''" :message="noticeLines.slice(1).join('\n')" @close="notices.next()" />
    </template>
    <Transition name="slide-out">
      <PhaseSlide v-if="overlay?.type === 'phase' && s && !s.opening" :key="overlay.phase" :kind="overlay.phase" :day="s.day" :roster="roster" @close="notices.next()" />
    </Transition>
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
    <FinalStage v-if="final" :final="final" :results="s?.results ?? null" :life-vote="!!s?.lifeVote" />

    <!-- 시작 전: 입장 현황 + 접속 QR. 게임 내용(재화 등)은 오프닝 전에 보여 주지 않는다 -->
    <div v-if="!s || isBeforeStart(s.status)" class="present-grid">
      <div v-if="s?.status === 'ready' && s.lobby" class="card span2">
        <h2>팀 입장 현황</h2>
        <div class="lobby">
          <div v-for="t in s.lobby" :key="t.teamId" class="lobby-team" :class="{ full: t.count >= t.capacity }">
            <span class="letter">{{ t.label }}</span>
            <span class="mono">{{ t.count }} / {{ t.capacity }}</span>
          </div>
        </div>
        <p class="muted note">QR 로 접속해 PIN 으로 로그인한 뒤 닉네임을 입력하고 팀을 고르세요.</p>
      </div>
      <div class="card">
        <h2>접속 주소</h2>
        <AccessQr />
      </div>
    </div>

    <!-- 시작 후: 현황판. 지금 라운드·단계·남은 시간 + 네 팀 카드. 리더 협의는 안건 -->
    <template v-else>
      <div v-if="s?.status === 'running'" class="board-head">
        <div>
          <p class="round mono">{{ s.day }}라운드 / {{ s.totalDays }}</p>
          <h1>{{ stageTitle }}</h1>
        </div>
        <div class="head-side">
          <p class="guide">{{ stageGuide }}</p>
          <div v-if="timer" class="clock" :class="{ warn: timer.warn || timer.over }">
            <p class="mono">{{ timer.over ? '종료' : timer.text }}</p>
            <div class="meter"><i :style="{ width: `${timer.ratio * 100}%` }" /></div>
          </div>
        </div>
      </div>
      <div v-if="s?.status === 'running'" class="board-steps"><GamePhaseBar large /></div>
      <template v-if="council">
        <div class="agenda">
          <section class="card"><h2><Icon name="aid" /> 원조</h2><p>대가 없는 재화 양도. 라운드당 1번</p></section>
          <section v-if="council.warText" class="card"><h2><Icon name="war" /> 다음 라운드 전쟁 제재</h2><p>{{ council.warText }}</p></section>
          <section v-if="council.lifeVote" class="card"><h2><Icon name="scroll" /> 라이프 투표권</h2><p>{{ council.lifeVote }}</p></section>
        </div>
      </template>
      <div v-else-if="roster.length" class="team-cards" :class="{ lit: s?.status === 'running' && s.phase === 'life' && s.livesDone }">
        <section v-for="t in roster" :key="t.teamId" class="card team-card" :style="{ '--team': teamInk(t.color) ?? 'var(--ink)' }">
          <header>
            <Crest :team="teams.byId(t.teamId)?.code" :size="44" />
            <span class="name">{{ t.name.replace(/ 팀$/, '') }}</span>
            <span class="count mono">{{ alive(t) }} / {{ t.members.length }}</span>
          </header>
          <p v-if="leaderOf(t)" class="leader">{{ leaderOf(t)?.name }} <span class="muted">리더</span></p>
          <ul>
            <li v-for="(m, i) in othersOf(t)" :key="i" :class="{ out: m.eliminated }"><span>{{ m.name }}</span></li>
          </ul>
        </section>
      </div>
      <div class="stats">
        <section class="card">
          <p class="label"><Icon name="gold" /> 골드 발행 현황</p>
          <p class="value">{{ (s?.initialTotals.gold ?? 0) + (s?.goldIssued ?? 0) }}개</p>
        </section>
        <section v-if="warLine" class="card" :class="{ hot: warLine.hot }">
          <p class="label"><Icon name="war" /> {{ warLine.label }}</p>
          <p class="value">{{ warLine.value }}</p>
        </section>
      </div>
      <div class="brand-foot"><Crest all :size="30" /><BrandLogo :height="34" /></div>
    </template>
  </div>
</template>

<style scoped>
/*
 * 빔 투사용 배치 (docs/105). 루트 20px 이므로 1rem = 20px.
 * 세로를 아끼는 순서: 제목+단계 한 줄 → 타이머+안건 한 줄 → 팀 현황(남는 높이) → 작은 정보 한 줄. 1080p·720p 모두 스크롤 없이.
 */
.present { position: relative; max-width: none; min-height: 100vh; display: flex; flex-direction: column; gap: 12px; padding: 22px 36px 60px; }
.present :deep(.card) { margin-bottom: 0; padding: 12px 18px; }
.note { margin: 12px 0 0; font-size: 1.1rem; }
/* 1줄: 제목(왼쪽) + 단계 표시줄(오른쪽). 전쟁 줄은 한 줄 전체 */
.head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 20px; }
/* 시작 전: 제목만 크게. 시작 후: 단계 이름이 제목, 게임 이름은 아래 로고로 */
.present.pre .head :deep(.topbar h1) { font-size: 6rem; }
.present.pre .head :deep(.phase-bar) { display: none; }
.present.pre { justify-content: center; gap: 28px; padding: 0 6vw; }
.present.pre .present-grid { grid-template-columns: 1fr auto; gap: 40px; align-items: stretch; }
.present.pre .present-grid .span2 { grid-column: auto; }
.present.pre .card { box-shadow: none; background: none; padding: 0 !important; }
.present.pre .card h2 { display: none; }
.present.pre .lobby { grid-template-columns: repeat(4, 1fr); }
.present.pre .lobby-team { background: var(--surface); padding: 28px 16px; box-shadow: 0 0 0 1px var(--line-soft); }
.present.pre .note { font-size: 1.4rem; font-weight: 600; margin-top: 24px; }
.present.pre .card:last-child { background: var(--surface); padding: 20px !important; border-radius: 16px; }
.present:not(.pre):not(.revealing) .head :deep(.top-text) { display: none; }
.present:not(.pre) .head :deep(.phase-bar) { display: none; }
.brand-foot { position: absolute; right: 3.6vw; bottom: 16px; display: flex; align-items: center; gap: 10px; }
.head :deep(.topbar) { flex: 1 1 480px; margin: 0; padding: 0; align-items: center; }
.head :deep(.topbar h1) { font-size: 2.4rem; }
/* 알림·룰북·나가기는 어느 화면이든 왼쪽 아래. 공지·오프닝 화면 위, 영상과 전쟁 화면 아래 */
.head :deep(.topbar .row) { position: fixed; left: 18px; bottom: 14px; z-index: 1550; gap: 2px; color: var(--muted); }
.head :deep(.topbar .tool) { width: 40px; min-height: 40px; font-size: 22px; color: inherit; }
.head :deep(.phase-bar) { flex: 1 1 100%; margin: 0; padding: 0; background: none; box-shadow: none; }
.head :deep(.phase-bar .steps) { background: #e7e4da; padding: 5px; border-radius: 12px; }
.head :deep(.phase-bar .steps li) { border-radius: 8px; }
.head :deep(.phase-bar .now) { flex-direction: column; gap: 4px; padding-right: 460px; }
.head :deep(.phase-bar .day) { font-size: 1.3rem; font-weight: 600; }
/* 단계 공지가 사라질 때 */
.slide-out-leave-active { transition: opacity 1.4s ease; }
.slide-out-leave-to { opacity: 0; }
/* 현황판 */
.present:not(.pre) { height: 100vh; min-height: 0; overflow: hidden; gap: 2.4vh; padding: 3.6vh 3.6vw 7.6vh; }
.board-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 32px; }
.board-head .round { margin: 0; font-size: 2.6vh; font-weight: 600; color: var(--muted); }
.board-head h1 { margin: 2vh 0 0; font-size: 10.6vh; line-height: 1.1; }
.head-side { display: flex; flex-direction: column; align-items: flex-end; gap: 1.6vh; text-align: right; }
.guide { margin: 0; font-size: 2.6vh; font-weight: 600; color: var(--ink-2); }
.clock { text-align: right; }
.clock p { margin: 0; font-size: 10.6vh; font-weight: 600; line-height: 1; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
.clock.warn p { color: var(--red); }
.meter { width: 22vw; height: 4px; margin: 1.3vh 0 0 auto; border-radius: 2px; background: #d9d6cc; overflow: hidden; }
.meter i { display: block; height: 100%; margin-left: auto; background: var(--ink); transition: width 0.5s linear; }
.clock.warn .meter i { background: var(--red); }
.board-steps :deep(.phase-bar) { margin: 0; padding: 0; background: none; box-shadow: none; }
.board-steps :deep(.now) { display: none; }
.board-steps :deep(.steps) { background: #e7e4da; padding: 5px; border-radius: 12px; }
.board-steps :deep(.steps li) { font-size: 2.2vh; padding: 1.1vh 14px; border-radius: 8px; }
.team-cards { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.25vw; }
.present :deep(.card.team-card) { padding: 2.6vh 1.5vw; border-radius: var(--radius-card); }
.team-card header { display: flex; align-items: center; gap: 0.7vw; }
.team-card .name { font-size: 3vh; font-weight: 700; color: var(--team); }
.team-card .count { margin-left: auto; font-size: 2.4vh; font-weight: 600; color: var(--muted); }
.team-card .leader { margin: 2vh 0 0; font-size: 3.2vh; font-weight: 700; }
.team-card .leader .muted { font-size: 1.9vh; font-weight: 500; }
.team-card ul { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8vh 0.5vw; list-style: none; margin: 1.4vh 0 0; padding: 0; font-size: 2.6vh; font-weight: 500; }
.team-card li { position: relative; overflow: hidden; padding: 1.1vh 0.7vw; border-radius: var(--radius); background: #f7f6f2; color: var(--ink); text-align: center; transition: background 1.2s ease, color 1.2s ease; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.team-card li.out { background: #e6e4de; color: #a8a6a0; }
/* 라이프 제출이 끝나면 생존자 칸이 오른쪽 아래부터 파랗게 차오른다 */
.lit .team-card li:not(.out)::before { content: ''; position: absolute; inset: 0; background: linear-gradient(to top left, #c6d9ef 0, transparent 70%); animation: fill-up 1.8s ease-out both; }
.team-card li span { position: relative; }
@keyframes fill-up { from { opacity: 0; transform: translate(40%, 40%) scale(1.4); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .lit .team-card li:not(.out)::before { animation: none; } }
.agenda { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 1.25vw; align-content: start; margin-top: 1vh; }
.present :deep(.agenda .card) { padding: 3vh 2vw; border-radius: var(--radius-card); }
.agenda h2 { margin: 0 0 1vh; font-size: 3.4vh; }
.agenda p { margin: 0; font-size: 2.6vh; color: var(--ink-2); }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25vw; }
.present :deep(.stats .card) { display: flex; align-items: center; justify-content: space-between; gap: 2vw; padding: 1.6vh 1.5vw; border-radius: var(--radius-card); }
.stats .label { margin: 0; font-size: 2.6vh; font-weight: 600; color: var(--ink-2); white-space: nowrap; }
.stats .value { margin: 0; font-size: 4.2vh; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.stats .hot .label, .stats .hot .value { color: var(--red); }
/* 시작 전 */
.present-grid { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: start; }
.present-grid .span2 { grid-column: span 2; }
@media (max-width: 900px) { .present-grid { grid-template-columns: 1fr; } .present-grid .span2 { grid-column: auto; } }
.lobby { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.lobby-team { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px; border: 0; border-radius: 12px; font-size: 1.6rem; background: var(--bg-soft); }
.lobby-team.full { opacity: 0.4; }
.lobby-team .letter { font-family: var(--font-display); font-weight: 400; font-size: 4.6rem; line-height: 1; color: var(--ink); }
.subtitle { transition: opacity 0.8s ease; }
.subtitle.hidden { opacity: 0; transition: none; }
</style>

