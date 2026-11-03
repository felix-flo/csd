<script setup lang="ts">
import Icon from '../components/Icon.vue'
import { computed, onMounted, ref, watch } from 'vue'
import TopBar from '../components/TopBar.vue'
import EventFeed from '../components/EventFeed.vue'
import RosterCard from '../components/RosterCard.vue'
import UserAdmin from '../components/UserAdmin.vue'
import RulesEditor from '../components/RulesEditor.vue'
import TeamMark from '../components/TeamMark.vue'
import GameSetupCard from '../components/GameSetupCard.vue'
import GameControlCard from '../components/GameControlCard.vue'
import GameResourcesCard from '../components/GameResourcesCard.vue'
import ParticipantPins from '../components/ParticipantPins.vue'
import IssueAdminCard from '../components/IssueAdminCard.vue'
import { api } from '../lib/api'
import { askConfirm } from '../lib/confirm'
import { useRealtimeStore } from '../stores/realtime'
import { useGameStore } from '../stores/game'
import type { AdminUser, GroupInfo } from '../../../shared/types'

const rt = useRealtimeStore()
const game = useGameStore()

const menu = ref('teams')
const gameStatus = computed(() => game.admin?.state.status)
/** 왼쪽 메뉴: 언제든 쓰는 화면. 게임 현황은 오른쪽 현재 단계 관리에 상태에 맞게 나온다 */
const menus = computed<{ label: string; items: { key: string; label: string; off?: boolean }[] }[]>(() => [
  {
    label: '설정',
    items: [
      { key: 'setup', label: '게임 설정', off: gameStatus.value !== 'ready' },
      { key: 'teams', label: '팀 · 진행자' },
      { key: 'rules', label: '룰 편집' },
      { key: 'users', label: '계정 관리' },
    ],
  },
  {
    label: '운영',
    items: [
      { key: 'log', label: '알림 기록' },
      { key: 'manage', label: '게임 관리' },
    ],
  },
])
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

// 개발용: 실시간 파이프라인 확인용 공지 전송
const scope = ref<'all' | 'role' | 'group' | 'user'>('all')
const targetId = ref<number | null>(null)
const targetTeam = computed(() => groups.value.find((g) => g.id === targetId.value))
watch(scope, () => { targetId.value = null })
const targetRole = ref<'admin' | 'presenter' | 'member'>('member')
const message = ref('')
const status = ref('')

async function clearNotices() {
  if (!(await askConfirm('모든 공지 알림 기록을 삭제할까요? 룰 갱신 알림과 게임 기록은 유지됩니다.'))) return
  status.value = ''
  try {
    const res = await api.delete<{ deleted: number }>('/api/admin/events', { types: ['notice'] })
    status.value = `공지 ${res.deleted}건 삭제됨`
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  }
}

async function send() {
  status.value = ''
  try {
    await api.post('/api/admin/notice', {
      scope: scope.value,
      targetId: scope.value === 'group' || scope.value === 'user' ? targetId.value : null,
      targetRole: scope.value === 'role' ? targetRole.value : null,
      message: message.value,
    })
    status.value = '전송됨'
    message.value = ''
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  }
}
</script>

<template>
  <div class="admin">
    <div class="left">
    <aside class="side">
      <TopBar title="게임 진행자" side>
        <template v-if="game.admin?.settings.tabLogin" #subtitle>
          관리자 (admin) · <span class="badge warn"><Icon name="flask" /> 테스트 모드 (탭 로그인)</span>
        </template>
      </TopBar>
      <nav aria-label="관리자 메뉴">
        <template v-for="g in menus" :key="g.label">
          <p class="group">{{ g.label }}</p>
          <button v-for="m in g.items" :key="m.key" type="button" class="item" :class="{ on: menu === m.key }" :disabled="m.off" @click="menu = m.key">
            {{ m.label }}
          </button>
        </template>
      </nav>
    </aside>
    <!-- 메뉴 화면 (왼쪽). 메뉴를 옮겨도 입력 중인 값이 지워지지 않게 v-if 가 아니라 v-show 로 숨긴다 -->
    <section id="admin-left" class="col">
    <div v-show="menu === 'setup'"><GameSetupCard v-if="gameStatus !== 'setup'" :groups="groups" @changed="loadUsers" /></div>
    <div v-show="menu === 'teams'"><RosterCard :users="users" :groups="groups" @updated="onUpdated" /></div>
    <div v-show="menu === 'rules'"><RulesEditor /></div>
    <div v-show="menu === 'users'"><UserAdmin :users="users" :groups="groups" @updated="onUpdated" /></div>
    <div v-show="menu === 'log'">
    <EventFeed />
    <div class="card">
      <h2>테스트 공지 보내기 <span class="muted">(개발용)</span></h2>
      <form @submit.prevent="send" class="row">
        <select v-model="scope">
          <option value="all">전체</option>
          <option value="role">역할</option>
          <option value="group">팀</option>
          <option value="user">개인</option>
        </select>
        <select v-if="scope === 'role'" v-model="targetRole">
          <option value="member">참가자 전원</option>
          <option value="presenter">프레젠테이션</option>
          <option value="admin">진행자</option>
        </select>
        <template v-if="scope === 'group'">
          <TeamMark v-if="targetTeam" :color="targetTeam.color" />
          <select v-model="targetId" required>
            <option :value="null" disabled>팀 선택</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </template>
        <select v-if="scope === 'user'" v-model="targetId" required>
          <option :value="null" disabled>참가자 선택</option>
          <option v-for="u in users" :key="u.id" :value="u.id">
            {{ u.groupName ?? u.role }} · {{ u.name }}{{ u.isLeader ? ' (리더)' : '' }}
          </option>
        </select>
        <input v-model="message" placeholder="메시지" style="flex: 1; min-width: 12em" required />
        <button type="submit">전송</button>
      </form>
      <div class="row" style="margin-top: 8px">
        <button class="secondary small" @click="clearNotices">공지 기록 초기화</button>
        <span class="muted">{{ status }}</span>
      </div>
    </div>
    </div>
    </section>
    </div>
    <!-- 현재 단계 관리 (오른쪽). 지금 상태에 맞는 것만 나오므로 메뉴가 없다 -->
    <main class="col">
      <GameControlCard :menu="menu" :users="users" :groups="groups" @updated="onUpdated" @notices="menu = 'log'" />
      <GameSetupCard v-if="gameStatus === 'setup'" :groups="groups" @changed="loadUsers" />
      <ParticipantPins v-if="gameStatus === 'ready'" :users="users" :groups="groups" />
      <GameResourcesCard :groups="groups" />
      <IssueAdminCard :groups="groups" />
    </main>
  </div>
</template>

<style scoped>
button.small { padding: 4px 10px; font-size: 0.85rem; }
.admin { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 16px; height: 100vh; padding: 12px 16px; overflow: hidden; }
/* 메뉴와 메뉴 화면을 한 판으로 묶는다 */
.left { display: grid; grid-template-columns: 176px minmax(0, 1fr); min-height: 0; border-radius: var(--radius-card); background: var(--surface); box-shadow: 0 0 0 1px var(--line-soft); overflow: hidden; }
.side { display: flex; flex-direction: column; gap: 2px; min-height: 0; overflow-y: auto; padding: 14px 10px; background: var(--bg-soft); }
.side :deep(.topbar) { flex-wrap: wrap; gap: 4px; padding: 0 4px; margin: 0 0 8px; }
.side :deep(.topbar h1) { font-size: 1.4rem; white-space: nowrap; }
.side :deep(.top-text) { flex: 1 1 100%; }
.side :deep(.topbar .row) { gap: 2px; }
.side :deep(.tool) { width: 32px; min-height: 32px; font-size: 20px; }
.col { min-height: 0; overflow-y: auto; }
#admin-left { container-type: inline-size; padding: 6px 4px; }
#admin-left :deep(.card) { margin: 0; background: none; box-shadow: none; border-radius: 0; }
#admin-left :deep(.card + .card) { border-top: 1px solid var(--line-soft); }
main.col { display: flex; flex-direction: column; scrollbar-width: none; }
main.col::-webkit-scrollbar { display: none; }
main.col > :deep(*) { flex: none; }
.group { margin: 16px 0 4px; padding: 0 6px; font-size: 0.8rem; font-weight: 600; color: var(--muted); }
.item { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 0 10px; background: none; color: var(--ink-2); text-align: left; font-weight: 500; }
.item:hover { background: rgba(8, 8, 8, 0.05); }
.item:disabled:hover { background: none; }
.item.on, .item.on:hover { background: var(--surface); color: var(--ink); font-weight: 700; box-shadow: 0 1px 3px rgba(8, 8, 8, 0.14); }
@media (max-width: 767px) {
  .admin { grid-template-columns: minmax(0, 1fr); gap: 12px; height: auto; overflow: visible; }
  .left { grid-template-columns: minmax(0, 1fr); }
  .side, .col { overflow: visible; }
  .side nav { display: flex; gap: 4px; overflow-x: auto; }
  .group { display: none; }
  .item { flex: none; width: auto; }
}
</style>
