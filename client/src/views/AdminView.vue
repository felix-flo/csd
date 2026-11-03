<script setup lang="ts">
import Icon, { type IconName } from '../components/Icon.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import RosterCard from '../components/RosterCard.vue'
import UserAdmin from '../components/UserAdmin.vue'
import RulesEditor from '../components/RulesEditor.vue'
import GameSetupCard from '../components/GameSetupCard.vue'
import GameControlCard from '../components/GameControlCard.vue'
import GameResourcesCard from '../components/GameResourcesCard.vue'
import ParticipantPins from '../components/ParticipantPins.vue'
import IssueAdminCard from '../components/IssueAdminCard.vue'
import { api } from '../lib/api'
import { useRealtimeStore } from '../stores/realtime'
import { useGameStore } from '../stores/game'
import type { AdminUser, GroupInfo } from '../../../shared/types'

const rt = useRealtimeStore()
const game = useGameStore()

const menu = ref('teams')
const gameStatus = computed(() => game.admin?.state.status)
/** 발행이 일어나는 단계(거래·마지막 발행)에는 발행 현황을 "지금 할 일" 바로 아래로 올린다 */
const issueHot = computed(() => game.admin?.state.status === 'running' && (game.admin.state.phase === 'trade' || game.admin.state.phase === 'last_issue'))
/** 왼쪽 메뉴: 언제든 쓰는 화면. 게임 현황은 오른쪽 현재 단계 관리에 상태에 맞게 나온다 */
const menus = computed<{ label: string; items: { key: string; label: string; icon: IconName; off?: boolean }[] }[]>(() => [
  {
    label: '설정',
    items: [
      { key: 'teams', label: '팀 · 진행자', icon: 'users' },
      { key: 'rules', label: '룰 편집', icon: 'edit' },
      { key: 'users', label: '계정 관리', icon: 'key' },
    ],
  },
  {
    label: '운영',
    items: [
      { key: 'log', label: '알림 기록', icon: 'bell' },
      { key: 'manage', label: '게임 관리', icon: 'refresh' },
    ],
  },
])
/** 메뉴 화면(덮개)이 열려 있는지. 평소에는 닫혀 있고 진행판이 화면 전체를 쓴다 */
const drawerOpen = ref(false)
function openMenu(key: string) {
  menu.value = key
  drawerOpen.value = true
}
/** 아이콘을 누르면 그 메뉴 화면을 연다. 열려 있는 메뉴를 다시 누르면 닫는다 */
function pick(key: string, e: Event) {
  if (drawerOpen.value && menu.value === key) drawerOpen.value = false
  else openMenu(key)
  ;(e.currentTarget as HTMLElement).blur()
}
/** 닫기: Esc, 또는 메뉴 화면 바깥을 누를 때. 상태판(다음 단계 버튼)·팝업·아이콘 줄을 누를 때는 닫지 않는다 */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && drawerOpen.value && !document.querySelector('.modal-backdrop')) drawerOpen.value = false
}
function onPointer(e: PointerEvent) {
  if (!drawerOpen.value) return
  const t = e.target as Element | null
  if (t?.closest('.drawer, .rail, .ctrl, .modal-backdrop, .appbar')) return
  drawerOpen.value = false
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', onPointer, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', onPointer, true)
})
// 지금 고른 메뉴를 쓸 수 없게 되면 쓸 수 있는 첫 메뉴로
watch(menus, (groups) => {
  const items = groups.flatMap((g) => g.items)
  if (items.find((m) => m.key === menu.value)?.off) menu.value = items.find((m) => !m.off)?.key ?? 'log'
}, { immediate: true })

const users = ref<AdminUser[]>([])
const groups = ref<GroupInfo[]>([])
async function loadUsers() {
  const res = await api.get<{ users: AdminUser[]; groups: GroupInfo[] }>('/api/admin/users')
  users.value = res.users
  groups.value = res.groups
}
onMounted(() => {
  void loadUsers()
  void game.load()
})
// 리더 선출·라이프 탈락·리셋 등으로 계정 상태가 바뀌면 다시 받는다
watch(() => rt.groupVersion, loadUsers)
// 게임 설정 저장(테스트 계정 포함 여부)·초기셋팅완료·시작·리셋은 계정을 만들거나 지우거나 활성 상태를 바꾼다
watch(() => [game.admin?.settings.includeTest, game.admin?.state.status], loadUsers)
function onUpdated(u: AdminUser[], g?: GroupInfo[]) {
  users.value = u
  if (g) groups.value = g
}

</script>

<template>
  <div class="admin-page">
  <!-- 앱 바: 제목 · 계정 · 룰북 · 로그아웃. 항상 맨 위 -->
  <header class="appbar">
    <TopBar title="게임 진행자" side>
      <template v-if="game.admin?.settings.tabLogin" #subtitle>
        관리자 (admin) · <span class="badge warn"><Icon name="flask" /> 테스트 모드 (탭 로그인)</span>
      </template>
    </TopBar>
  </header>
  <div class="admin" :class="{ open: drawerOpen }">
    <!-- 메뉴 아이콘 줄: 마우스를 올리면 이름까지 펼쳐진다 (덮기만 하고 밀지 않는다) -->
    <aside class="side">
      <div class="rail">
        <nav aria-label="관리자 메뉴">
          <template v-for="g in menus" :key="g.label">
            <p class="group">{{ g.label }}</p>
            <button v-for="m in g.items" :key="m.key" type="button" class="item" :class="{ on: drawerOpen && menu === m.key }" :disabled="m.off" :title="m.label" @click="pick(m.key, $event)">
              <Icon :name="m.icon" /><span class="lbl">{{ m.label }}</span>
            </button>
          </template>
        </nav>
      </div>
    </aside>

    <!-- 진행판: 노트북 폭 전체. 맨 위 상태판, 아래 왼쪽 "지금 할 일" · 오른쪽 참고 -->
    <main class="prog">
      <div id="admin-head" />
      <div class="cols" :class="{ single: gameStatus === 'setup', ready: gameStatus === 'ready' }">
        <div class="now">
          <GameControlCard :menu="menu" :users="users" :groups="groups" @updated="onUpdated" @notices="openMenu('log')" />
          <!-- 게임 설정: 설정 단계에는 진행판 전체, 준비 단계에는 오른쪽 칸. 시작하면 바꿀 수 없으므로 사라진다 -->
          <GameSetupCard v-if="gameStatus === 'setup'" :groups="groups" @changed="loadUsers" />
          <ParticipantPins v-if="gameStatus === 'ready'" :users="users" :groups="groups" />
        </div>
        <div v-show="gameStatus !== 'setup'" id="admin-side" class="ref">
          <GameSetupCard v-if="gameStatus === 'ready'" class="side-setup" :groups="groups" @changed="loadUsers" />
          <GameResourcesCard class="res-card" :groups="groups" />
          <IssueAdminCard :groups="groups" :class="issueHot ? 'hot' : 'cool'" />
        </div>
      </div>
    </main>

    <!-- 메뉴 화면: 메뉴를 누를 때만 진행판을 덮으며 열린다 (오른쪽 끝 120px 은 남겨 뒤가 진행판임을 보인다) (닫기: X · Esc · 같은 메뉴 다시 누르기).
         닫아도 입력 중인 값이 지워지지 않게 v-show 로 숨긴다 -->
    <section v-show="drawerOpen" class="drawer" aria-label="메뉴 화면">
      <header class="drawer-head">
        <button type="button" class="close" aria-label="닫기" title="닫기 (Esc)" @click="drawerOpen = false"><Icon name="close" /></button>
      </header>
      <div id="admin-left" class="drawer-body">
        <div v-show="menu === 'teams'"><RosterCard :users="users" :groups="groups" @updated="onUpdated" /></div>
        <div v-show="menu === 'rules'"><RulesEditor /></div>
        <div v-show="menu === 'users'"><UserAdmin :users="users" :groups="groups" @updated="onUpdated" /></div>
        <div v-show="menu === 'log'"><EventFeed /></div>
      </div>
    </section>
  </div>
  </div>
</template>

<style scoped>
button.small { padding: 4px 10px; font-size: 0.85rem; }
/* 관리자 화면 입력칸은 높이 하나로 통일 (컴포넌트마다 얇게 덮어쓰지 않는다) */
.admin-page :deep(input:not([type='checkbox']):not([type='radio'])), .admin-page :deep(select) { min-height: 38px; padding: 6px 10px; font-size: 0.95rem; }
.admin-page { display: flex; flex-direction: column; height: 100vh; padding: 6px 16px 12px; overflow: hidden; }
.appbar { flex: none; }
.appbar :deep(.topbar) { margin: 0 0 6px; padding: 0 2px; }
.appbar :deep(.topbar h1) { font-size: 1.3rem; white-space: nowrap; }
.appbar :deep(.tool) { width: 40px; min-height: 36px; font-size: 22px; }
.admin { position: relative; flex: 1; display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 12px; min-height: 0; }

/* 메뉴 아이콘 줄 */
.side { position: relative; z-index: 40; min-height: 0; }
.rail { position: absolute; inset: 0 auto 0 0; width: 56px; display: flex; flex-direction: column; gap: 2px; overflow: hidden auto; padding: 12px 8px; border-radius: var(--radius-card); background: var(--bg-soft); box-shadow: 0 0 0 1px var(--line-soft); transition: width 0.16s ease, box-shadow 0.16s ease; }
.rail:hover { width: 188px; box-shadow: 0 0 0 1px var(--line-soft), 8px 0 24px -12px rgba(8, 8, 8, 0.35); }
.admin:not(.open) .rail:not(:hover) .lbl, .admin:not(.open) .rail:not(:hover) .group { opacity: 0; }
/* 메뉴 화면이 열려 있으면 아이콘 줄도 이름까지 펼친 채로 둔다 */
.admin.open .rail { width: 188px; border-radius: var(--radius-card) 0 0 var(--radius-card); box-shadow: 0 0 0 1px var(--line-soft); }
.group { margin: 12px 0 2px; padding: 0 6px; font-size: 0.8rem; font-weight: 600; color: var(--muted); white-space: nowrap; transition: opacity 0.12s; }
.item { display: flex; align-items: center; gap: 12px; width: 100%; min-width: 172px; padding: 0 10px; background: none; color: var(--ink-2); text-align: left; font-weight: 500; white-space: nowrap; }
.item :deep(.icon) { flex: none; width: 20px; height: 20px; }
.lbl { transition: opacity 0.12s; }
.item:hover { background: rgba(8, 8, 8, 0.05); }
.item:disabled:hover { background: none; }
.item.on, .item.on:hover { background: var(--surface); color: var(--ink); font-weight: 700; box-shadow: 0 1px 3px rgba(8, 8, 8, 0.14); }

/* 진행판 */
.prog { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; }
#admin-head { flex: none; }
#admin-head :deep(.ctrl) { position: static; margin: 0; }
.cols { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(300px, 1fr); gap: 12px; }
.cols.single { grid-template-columns: minmax(0, 1fr); }
/* 준비 단계: 오른쪽(게임 설정)이 넓게, 왼쪽은 입장 현황·테러리스트·PIN */
.cols.ready { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); }
.now, .ref { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.now > :deep(*), .ref > :deep(*) { flex: none; }
/* 참고 칸 순서: (발행이 일어나는 단계면) 발행 현황 → 팀 재화 → 발행 현황 → 이주·테러리스트 */
.ref > .res-card { order: 1; }
/* 오른쪽 칸의 게임 설정(준비 단계): 칸이 좁으니 설정 묶음을 한 줄에 하나씩 */


.ref > .cool { order: 2; }

/* 메뉴 화면 (덮개) */
.drawer { position: absolute; top: 0; bottom: 0; left: 188px; z-index: 35; width: calc(100% - 188px - 120px); display: flex; flex-direction: column; border-radius: 0 var(--radius-card) var(--radius-card) 0; background: var(--surface); box-shadow: 0 0 0 1px var(--line-soft), 16px 0 40px -18px rgba(8, 8, 8, 0.45); }
.drawer-head { position: absolute; top: 8px; right: 8px; z-index: 1; }
.close { width: 36px; min-height: 36px; padding: 0; background: none; color: var(--ink-2); font-size: 20px; display: inline-flex; align-items: center; justify-content: center; }
.close:hover { background: var(--bg-soft); color: var(--ink); }
.drawer-body { flex: 1; min-height: 0; overflow-y: auto; container-type: inline-size; padding: 4px 6px; }
/* 닫기 버튼 자리: 각 화면 제목 줄 오른쪽 끝을 비워 둔다 */
.drawer-body :deep(.card > :first-child) { padding-right: 44px; }
.drawer-body :deep(.card) { margin: 0; background: none; box-shadow: none; border-radius: 0; }
.drawer-body :deep(.card + .card) { border-top: 1px solid var(--line-soft); }

@media (max-width: 900px) {
  .cols { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
  .now, .ref { overflow: visible; }
  .drawer { width: calc(100% - 188px); }
}
</style>
