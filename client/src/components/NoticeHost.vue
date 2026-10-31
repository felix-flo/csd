<script setup lang="ts">
/**
 * 참가자 알림 (docs/107). 한 번에 하나씩, 확인을 누를 때까지 화면을 덮는다.
 * 화면 테두리와 카드 테두리는 레인보우로 반짝이고, 확인 버튼은 팀 색이다.
 * 전쟁 선포는 전체 화면. 거래 알림은 "제목 → 방향 → 설명" 순서로 보여 준다 (수량은 오프라인에서 조정하므로 넣지 않는다).
 */
import { computed } from 'vue'
import Icon from './Icon.vue'
import WarCrest from './WarCrest.vue'
import { useAuthStore } from '../stores/auth'
import { useRealtimeStore } from '../stores/realtime'
import { useTeamsStore } from '../stores/teams'
import { useToastStore } from '../stores/toasts'
import { shortTeamName, teamThemeStyle } from '../lib/teamTheme'

const auth = useAuthStore()
const rt = useRealtimeStore()
const teams = useTeamsStore()
const toasts = useToastStore()

const current = computed(() => {
  if (toasts.held) return null
  return toasts.items.find((t) => t.kind === 'war.declared') ?? toasts.items[0] ?? null
})
const isWar = computed(() => current.value?.kind === 'war.declared')
const theme = computed(() => teamThemeStyle(teams.byId(auth.user?.groupId)))
const route = computed(() => {
  const r = current.value?.route
  if (!r) return null
  const [from, to] = [teams.byId(r[0]), teams.byId(r[1])]
  return { from: shortTeamName(from?.name), fromCode: from?.code ?? '', to: shortTeamName(to?.name), toCode: to?.code ?? '' }
})
const time = computed(() => {
  const d = new Date((current.value?.createdAt ?? '').replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

function confirm() {
  const t = current.value
  if (!t) return
  rt.markInboxSeen(t.id)
  toasts.dismiss(t.id)
}
</script>

<template>
  <div v-if="current" class="notice-layer" :style="theme" role="alertdialog" aria-live="assertive">
    <div v-if="isWar" class="take">
      <div class="h"><Icon name="megaphone" />{{ current.label }}<template v-if="time"> · {{ time }}</template></div>
      <div class="take-body">
        <WarCrest />
        <p class="big">전쟁 선포</p>
        <p v-if="route" class="route"><span>{{ route.from }}</span><Icon name="arrow" /><span>{{ route.to }}</span></p>
        <p class="sub">결과가 나올 때까지<br />모든 거래가 멈춥니다</p>
      </div>
      <button class="ok" type="button" @click="confirm">확인</button>
    </div>
    <template v-else>
      <div class="scrim"></div>
      <div class="notice">
        <div class="h"><Icon name="megaphone" />{{ current.label }}<span v-if="toasts.items.length > 1" class="count">1 / {{ toasts.items.length }}</span></div>
        <template v-if="current.headline">
          <p class="kind">{{ current.headline }}</p>
          <p v-if="route" class="route"><span :class="`c-${route.fromCode}`">{{ route.from }}</span><Icon name="arrow" /><span :class="`c-${route.toCode}`">{{ route.to }}</span></p>
          <p v-if="current.detail" class="sub">{{ current.detail }}</p>
        </template>
        <p v-else class="msg">{{ current.message }}</p>
        <button class="ok" type="button" @click="confirm">확인</button>
      </div>
    </template>
    <div class="edge"></div>
  </div>
</template>

<style scoped>
.notice-layer { position: fixed; inset: 0; z-index: 1000; display: flex; justify-content: center; color: #fff; }
.scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); }
.edge, .notice::before { content: ''; position: absolute; inset: 0; background: conic-gradient(#ff4d6d, #ff9f1c, #ffe14d, #4ade80, #38bdf8, #a78bfa, #ff4d6d); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
.edge { padding: 8px; }
.notice { position: absolute; left: 8px; right: 8px; top: 8px; max-width: 464px; margin: 0 auto; padding: 14px 16px 16px; background: #0a0b0e; }
.notice::before { padding: 4px; }
.h { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; }
.h :deep(.icon) { font-size: 24px; }
.count { margin-left: auto; font: 800 15px 'Archivo', sans-serif; }
.kind { margin: 14px 0 0; font: 400 28px/1.1 var(--font-play); text-align: center; }
.route { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 12px 0 0; font: 400 clamp(32px, 11vw, 44px)/1 var(--font-play); }
.route :deep(.icon) { font-size: 34px; color: #c3c9d4; stroke-width: 2.8; }
.c-white { color: #fff; }
.c-yellow { color: #f5c518; }
.c-blue { color: #5b9cff; }
.c-red { color: #ff6b6b; }
.sub { margin: 14px 0 0; font-size: 17px; font-weight: 600; line-height: 1.35; text-align: center; word-break: keep-all; }
.msg { margin: 12px 0 0; font-size: 23px; font-weight: 800; line-height: 1.32; word-break: keep-all; overflow-wrap: anywhere; }
.ok { position: relative; width: 100%; height: 54px; margin-top: 16px; background: var(--accent); border: 0; color: var(--accent-fg); font-size: 18px; font-weight: 800; letter-spacing: 0; text-transform: none; }
.ok:hover { background: var(--accent); color: var(--accent-fg); }
.take { position: absolute; inset: 0; display: flex; flex-direction: column; padding: 22px 24px 28px; background: #c0101a; text-align: center; }
.take .h { justify-content: center; font-size: 16px; }
.take-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.big { margin: 6px 0 0; font: 400 clamp(46px, 17vw, 66px)/1.1 var(--font-gungseo); letter-spacing: -0.03em; -webkit-text-stroke: 1.2px #fff; }
.take .route { margin-top: 6px; font: 400 clamp(28px, 10vw, 38px)/1.1 var(--font-gungseo); letter-spacing: -0.03em; -webkit-text-stroke: 0.6px #fff; }
.take .route :deep(.icon) { color: #fff; }
.take .sub { margin-top: 10px; font: 400 21px/1.35 var(--font-gungseo); letter-spacing: -0.05em; -webkit-text-stroke: 0.3px #fff; }
.take .ok { flex: none; height: 64px; margin-top: 12px; border: 2px solid #fff; font-size: 20px; }
@media (prefers-reduced-motion: no-preference) {
  .edge, .notice::before { animation: hue-run 2.4s linear infinite; }
}
@keyframes hue-run { to { filter: hue-rotate(360deg); } }
</style>
