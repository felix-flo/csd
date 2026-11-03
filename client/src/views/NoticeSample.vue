<script setup lang="ts">
/**
 * 개발 서버 전용: 알림 디자인 모아 보기. 주소의 ?case= 에 맞춰 실제 알림 컴포넌트를 가짜 데이터로 띄운다.
 * 빌드에는 들어가지 않는다 (router 가 개발 서버에서만 이 화면을 등록).
 */
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { useNoticeStore } from '../stores/notices'
import { useRealtimeStore } from '../stores/realtime'
import { useTeamsStore } from '../stores/teams'
import TopBar from '../components/TopBar.vue'
import NoticeBar from '../components/NoticeBar.vue'
import FullNotice from '../components/FullNotice.vue'
import WarCall from '../components/WarCall.vue'
import PhaseSlide from '../components/PhaseSlide.vue'
import ModalDialog from '../components/ModalDialog.vue'
import SpyCard from '../components/SpyCard.vue'
import EventFeed from '../components/EventFeed.vue'

const kase = String(useRoute().query.case ?? '')
const role = kase.startsWith('pt') ? 'presenter' : kase.startsWith('admin') ? 'admin' : 'member'
const auth = useAuthStore()
const game = useGameStore() as any
const notices = useNoticeStore() as any
const rt = useRealtimeStore() as any
const teams = useTeamsStore() as any

teams.teams = [
  { id: 1, name: '화이트 팀', code: 'white', color: '#ffffff' },
  { id: 2, name: '골드 팀', code: 'yellow', color: '#f5b800' },
  { id: 3, name: '블루 팀', code: 'blue', color: '#2f6fb8' },
  { id: 4, name: '레드 팀', code: 'red', color: '#b3362b' },
]
;(auth as any).user = { id: 9, name: '문가람', role, groupId: 1, isLeader: false, nameSet: true }
game.state = { status: 'running', day: 2, totalDays: 6, phase: 'trade', opening: null, final: null, war: { active: /warcall/.test(kase) ? { id: 1, attacker: 4, defender: 3 } : null, today: /warcall|warend/.test(kase) ? { attacker: 4, defender: 3, status: /warend/.test(kase) ? 'attacker_won' : 'declared' } : null } }
if (role === 'presenter') document.documentElement.dataset.screen = 'present'
if (role === 'member') document.body.dataset.team = 'white'
rt.connected = true
notices.configure(role)
notices.latest = { id: 1, label: '', message: '거래 시간이 시작되었습니다', war: false, link: null }
if (kase === 'phone-pinwar') notices.latest = { id: 1, label: '', message: '전쟁 종료: 레드 팀이 승리했습니다 (레드 팀 → 블루 팀).', war: true, link: null }
if (kase === 'phone-pinrule') notices.latest = { id: 1, label: '', message: '"게임 룰" 이(가) 갱신되었습니다', war: false, link: '/rules' }
if (kase === 'phone-version') rt.outdated = true
if (kase === 'phone-out') (auth as any).eliminated = true
const time = '2026-11-02 05:30:00'
rt.events = [
  { id: 3, type: 'game', scope: 'all', createdAt: time, payload: { message: '2라운드 거래 시간이 시작되었습니다' } },
  { id: 4, type: 'trade', scope: 'group', targetId: 1, targetName: '화이트 팀', createdAt: time, payload: { message: '골드 팀과 거래 완료: 보석 20 ↔ 라이프 2' } },
  { id: 5, type: 'game', scope: 'all', createdAt: time, payload: { message: '전쟁이 선포되었습니다 (레드 팀 → 블루 팀)', war: true } },
]
const ROSTER = [1, 2, 3, 4].map((i) => ({ teamId: i, name: teams.teams[i - 1].name, members: [{ name: ['김하늘', '이바다', '정노을', '한구름'][i - 1], isLeader: true }] }))
const SPY = { reward: 0, eliminated: 0, alive: true } as any
</script>

<template>
  <div class="page" :style="role === 'member' ? '' : 'max-width: none'">
    <TopBar :title="role === 'member' ? '화이트 팀' : '게임 진행자'" :team="role === 'member' ? 'white' : null" />
    <NoticeBar v-if="role !== 'presenter'" style="position: sticky; top: 8px; margin-bottom: 12px" />
    <EventFeed v-if="kase === 'phone-list' || kase === 'admin-feed'" plain bare />
    <WarCall v-if="/warcall|warend/.test(kase)" :large="role === 'presenter'" />
    <PhaseSlide v-if="kase === 'pt-slide'" kind="trade" :day="2" :roster="ROSTER as any" />
    <PhaseSlide v-if="kase === 'pt-leaders'" kind="leaders" :day="2" :roster="ROSTER as any" />
    <FullNotice v-if="kase === 'pt-notice'" kicker="공지" title="화이트 팀 탈락: 문가람, 김하늘" />
    <ModalDialog :open="kase === 'phone-modal'" title="확인해 주세요" message="지금 선택을 제출할까요? 선택은 되돌릴 수 없습니다" cancel-label="닫기" />
    <SpyCard v-if="kase === 'phone-spy'" :spy="SPY" intro />
  </div>
</template>
