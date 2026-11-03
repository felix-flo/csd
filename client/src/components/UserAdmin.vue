<script setup lang="ts">
/**
 * 계정 관리: 이름 수정, PIN 열람/리셋, 탈락(비활성)/복귀, 팀 이동.
 * - 참가자 삭제는 없다. 게임에서 빠지면 "탈락 처리" → 로그인 차단 + 세션 종료 + 팀 재화·알림 수신 불가.
 * - 팀 이동은 재로그인 없이 즉시 반영되고, 이전 팀·새 팀 팀원에게 알림이 간다.
 * - PIN 리셋은 본인과 프레젠테이션 계정 제외. 리셋하면 해당 유저의 세션이 즉시 끊긴다.
 * - 리더 지정: 시작 전에는 필요 없다 (1라운드 리더 선출부터 정한다). 진행 중에도 수동 교체용으로 쓸 수 있다.
 * - 팀 없는 참가자 = 준비 상태에서 아직 팀을 고르지 않은 PIN. 팀 이동으로 직접 배정할 수 있다.
 */
import { computed, ref } from 'vue'
import type { AdminUser, GroupInfo } from '../../../shared/types'
import { api } from '../lib/api'
import { askConfirm } from '../lib/confirm'
import { useAuthStore } from '../stores/auth'
import { useGameStore } from '../stores/game'
import { isBeforeStart, teamLetter } from '../../../shared/game'
import TeamMark from './TeamMark.vue'

const props = defineProps<{ users: AdminUser[]; groups: GroupInfo[] }>()
const emit = defineEmits<{ updated: [users: AdminUser[]] }>()
const auth = useAuthStore()
const game = useGameStore()
const beforeStart = computed(() => isBeforeStart(game.admin?.state.status))
/** 참가자에게 보이는 팀 이름 (시작 전 A, B, C…) */
const letterOf = (teamId: number) => teamLetter(props.groups.findIndex((g) => g.id === teamId))

const busy = ref(false)
const status = ref('')
const editingId = ref<number | null>(null)
const editName = ref('')
const showPins = ref(false)
/** 개별로 연 PIN (계정 id). "전체 PIN 숨기기" 를 누르면 함께 닫는다 */
const openPins = ref(new Set<number>())
const pinShown = (id: number) => showPins.value || openPins.value.has(id)
function togglePin(id: number) {
  const next = new Set(openPins.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openPins.value = next
}
function toggleAllPins() {
  showPins.value = !showPins.value
  if (!showPins.value) openPins.value = new Set()
}

const members = computed(() => props.users.filter((u) => u.role === 'member'))
const staff = computed(() => props.users.filter((u) => u.role !== 'member'))
interface Section {
  key: string
  team: GroupInfo | null
  title: string
  list: AdminUser[]
  /** 접을 수 있는 묶음 (시작 전의 팀 미선택·테스트 계정) */
  collapsible: boolean
}
/**
 * 팀 순서대로 소속 참가자. 팀 없는 참가자는 맨 뒤.
 * 시작 전에는 팀 명단에 스스로 팀을 고른 참가자만 두고, 팀 미선택 PIN(→ "참가자 PIN" 카드)과 테스트 계정은 접힌 묶음으로 뺀다
 * (PIN 이 팀에 묶여 있는 것처럼 보이지 않게).
 * 시작 후에도 "테스트 계정 포함" 을 끈 채 시작했으면 테스트 계정은 팀 명단에 넣지 않는다 (비활성이지만 탈락이 아니라 게임 제외)
 */
const excludeTests = computed(() => game.admin?.settings.includeTest === false)
/** 테스트 계정을 팀 명단에서 빼고 "테스트 계정" 묶음에 둘지 */
const separateTests = computed(() => beforeStart.value || excludeTests.value)
const sections = computed<Section[]>(() => {
  const pre = beforeStart.value
  const sep = separateTests.value
  const inTeam = (u: AdminUser, g: GroupInfo) => u.groupId === g.id && !(sep && u.isTest)
  const result: Section[] = props.groups.map((g) => ({ key: `t${g.id}`, team: g, title: g.name, list: members.value.filter((u) => inTeam(u, g)), collapsible: false }))
  const orphans = members.value.filter((u) => !(sep && u.isTest) && (u.groupId == null || !props.groups.some((g) => g.id === u.groupId)))
  if (orphans.length) result.push({ key: 'none', team: null, title: '(팀 미선택)', list: orphans, collapsible: pre })
  const tests = sep ? members.value.filter((u) => u.isTest) : []
  if (tests.length) result.push({ key: 'test', team: null, title: '테스트 계정', list: tests, collapsible: true })
  return result
})
const expanded = ref<Record<string, boolean>>({})
const isOpen = (sec: Section) => !sec.collapsible || !!expanded.value[sec.key]

async function run(label: string, fn: () => Promise<{ users: AdminUser[] } & Record<string, unknown>>) {
  busy.value = true
  status.value = ''
  try {
    const res = await fn()
    emit('updated', res.users)
    status.value = label
    // 리더 지정·탈락/복귀·팀 이동은 게임 진행 카드의 시작 점검(리더 없는 팀·미배정 수)도 바꾼다 → 소켓 신호를 기다리지 않고 바로 다시 받는다
    void game.load()
    return res
  } catch (e) {
    status.value = `실패: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}

async function setActive(ids: number[], active: boolean, label?: string) {
  if (ids.length === 0) return
  if (!active && ids.length > 1 && !(await askConfirm(`${label ?? '선택한 참가자'} ${ids.length}명을 탈락 처리할까요? 접속 중이면 즉시 끊깁니다.`))) return
  return run(active ? '복귀 처리됨' : '탈락 처리됨', () => api.post('/api/admin/users/active', { ids, active }))
}

function moveTeam(u: AdminUser, e: Event) {
  const teamId = Number((e.target as HTMLSelectElement).value)
  const team = props.groups.find((g) => g.id === teamId)
  if (!team || teamId === u.groupId) return
  return run(`${u.name} → ${team.name}`, () => api.post(`/api/admin/users/${u.id}/team`, { teamId }))
}

function makeLeader(u: AdminUser) {
  return run(`${u.name} 리더 지정`, () => api.post(`/api/admin/users/${u.id}/leader`))
}

function startEdit(u: AdminUser) {
  editingId.value = u.id
  editName.value = u.name
}

async function saveName(u: AdminUser) {
  const name = editName.value.trim()
  if (!name) return
  await run(`${name} 으로 변경됨`, () => api.post(`/api/admin/users/${u.id}/name`, { name }))
  editingId.value = null
}

async function resetPin(u: AdminUser) {
  if (!(await askConfirm(`${u.name} 의 PIN 을 새로 발급할까요? 접속 중이면 즉시 끊깁니다.`))) return
  const res = await run('', () => api.post(`/api/admin/users/${u.id}/reset-pin`))
  if (res) status.value = `${u.name} 새 PIN: ${res.pin as string}`
}

function canResetPin(u: AdminUser) {
  return u.id !== auth.user?.id && u.role !== 'presenter'
}

function copyList() {
  const lines = props.users.map((u) => `${u.groupName ?? u.role}\t${u.name}\t${u.pin ?? ''}`)
  navigator.clipboard?.writeText(lines.join('\n')).then(
    () => { status.value = '이름/PIN 목록을 클립보드에 복사했습니다' },
    () => { status.value = '복사 실패' },
  )
}
</script>

<template>
  <div class="card">
    <h2>계정 관리</h2>
    <p class="muted">
      이름을 누르면 수정합니다. PIN 은 참가자에게 배부할 때만 여세요.
      탈락 처리하면 로그인할 수 없고 팀 재화·알림을 받지 못합니다. 팀 이동은 재로그인 없이 바로 반영됩니다.
    </p>

    <div class="tools">
      <button class="secondary small" @click="toggleAllPins">{{ showPins ? '전체 PIN 숨기기' : '전체 PIN 보기' }}</button>
      <button class="secondary small" @click="copyList">이름/PIN 복사</button>
      <button :disabled="busy" class="secondary small" @click="setActive(members.map((u) => u.id), true)">전체 복귀</button>
      <button :disabled="busy" class="secondary small danger" @click="setActive(members.map((u) => u.id), false, '참가자 전체')">전체 탈락</button>
    </div>
    <p class="muted status">{{ status }}</p>

    <section class="sec">
      <header class="sec-head"><strong>진행 계정</strong></header>
      <ul class="list">
        <li v-for="u in staff" :key="u.id" class="u">
          <div class="l1">
            <template v-if="editingId === u.id">
              <input v-model="editName" maxlength="20" class="name-input" @keyup.enter="saveName(u)" @keyup.esc="editingId = null" />
              <button class="small" :disabled="busy" @click="saveName(u)">저장</button>
            </template>
            <a v-else href="#" class="name" @click.prevent="startEdit(u)">{{ u.name }}</a>
            <span class="badge">{{ u.role }}</span>
            <span v-if="u.isFixed" class="badge" title="리셋해도 남는 고정 계정">고정</span>
            <span v-else-if="u.role === 'admin'" class="muted" title="게임 리셋 때 삭제됩니다">리셋 시 삭제</span>
          </div>
          <div class="l2">
            <span class="pin mono">{{ pinShown(u.id) ? u.pin : '••••' }}</span>
            <button v-if="!showPins" class="link" type="button" @click="togglePin(u.id)">{{ openPins.has(u.id) ? '숨기기' : 'PIN 보기' }}</button>
            <span class="sp" />
            <button v-if="canResetPin(u)" :disabled="busy" class="secondary small" @click="resetPin(u)">PIN 리셋</button>
          </div>
        </li>
      </ul>
    </section>

    <section v-for="sec in sections" :key="sec.key" class="sec">
      <header class="sec-head">
        <button v-if="sec.collapsible" class="toggle" type="button" @click="expanded[sec.key] = !expanded[sec.key]">{{ expanded[sec.key] ? '▾' : '▸' }}</button>
        <span v-if="sec.team && beforeStart" class="mono letter" title="참가자에게 보이는 이름">{{ letterOf(sec.team.id) }}</span>
        <TeamMark v-if="sec.team" :color="sec.team.color" />
        <strong>{{ sec.title }}</strong>
        <span class="muted">{{ sec.list.filter((u) => u.active).length }}명<template v-if="sec.list.some((u) => !u.active)"> · {{ sec.key === 'test' && excludeTests ? '제외' : '탈락' }} {{ sec.list.filter((u) => !u.active).length }}</template></span>
        <span class="sp" />
        <button v-if="sec.list.length" :disabled="busy" class="link" @click="setActive(sec.list.map((u) => u.id), true)">전체 복귀</button>
        <button v-if="sec.list.length" :disabled="busy" class="link danger" @click="setActive(sec.list.map((u) => u.id), false, sec.title)">전체 탈락</button>
      </header>
      <p v-if="sec.key === 'none' && beforeStart" class="muted note">PIN 상태는 "참가자 PIN" 카드에서 봅니다.</p>
      <p v-if="sec.key === 'test'" class="muted note">팀·리더가 미리 정해진 개발용 계정<template v-if="excludeTests"> · 게임 설정에서 제외됨</template></p>
      <p v-if="sec.team && beforeStart && sec.list.length === 0" class="muted note">아직 팀을 고른 참가자가 없습니다.</p>
      <ul v-if="isOpen(sec)" class="list">
        <li v-for="u in sec.list" :key="u.id" class="u" :class="{ inactive: !u.active }">
          <div class="l1">
            <template v-if="editingId === u.id">
              <input v-model="editName" maxlength="20" class="name-input" @keyup.enter="saveName(u)" @keyup.esc="editingId = null" />
              <button class="small" :disabled="busy" @click="saveName(u)">저장</button>
            </template>
            <template v-else>
              <a href="#" class="name" @click.prevent="startEdit(u)">{{ u.name }}</a>
              <span v-if="u.isLeader" class="badge">리더</span>
              <span v-if="u.isTest" class="badge role" title="시드 테스트 계정. 게임 설정에서 포함 여부를 정합니다">테스트</span>
              <span v-if="!u.nameSet" class="badge warn">이름 미입력</span>
            </template>
            <span class="sp" />
            <span v-if="u.isTest && excludeTests && !u.active" class="badge" title="게임 설정에서 테스트 계정 포함을 꺼 두었습니다">제외</span>
            <span v-else class="badge" :class="u.active ? 'on' : 'off'">{{ u.active ? '참가 중' : '탈락' }}</span>
          </div>
          <div class="l2">
            <select :value="u.groupId ?? ''" :disabled="busy" class="team-select" title="팀 이동" @change="moveTeam(u, $event)">
              <option v-if="u.groupId == null" value="" disabled>팀 없음</option>
              <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
            <span class="pin mono">{{ pinShown(u.id) ? u.pin : '••••' }}</span>
            <button v-if="!showPins" class="link" type="button" @click="togglePin(u.id)">{{ openPins.has(u.id) ? '숨기기' : 'PIN 보기' }}</button>
            <span class="acts">
              <button v-if="u.active && u.groupId != null && !u.isLeader" :disabled="busy" class="link" @click="makeLeader(u)">리더 지정</button>
              <button :disabled="busy" class="link" @click="resetPin(u)">PIN 리셋</button>
              <button :disabled="busy" class="link" :class="{ danger: u.active }" @click="setActive([u.id], !u.active)">{{ u.active ? '탈락 처리' : '복귀' }}</button>
            </span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.tools { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 0; }
.status { min-height: 1.2em; margin: 6px 0; }
.sec { margin-top: 10px; }
.sec-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 8px 10px; border-radius: var(--radius); background: var(--bg-soft); }
.note { margin: 4px 10px 0; font-size: 0.85rem; }
.list { list-style: none; margin: 0; padding: 0; }
.u { padding: 8px 10px; border-bottom: 1px solid var(--line-soft); }
.u.inactive { opacity: 0.55; }
.l1, .l2 { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.l2 { margin-top: 4px; font-size: 0.88rem; }
.sp { flex: 1; }
.acts { display: inline-flex; flex-wrap: nowrap; gap: 0 4px; margin-left: auto; }
.name { color: inherit; font-weight: 600; text-decoration: underline dotted; }
.name-input { width: 9em; }
.pin { letter-spacing: 0.15em; }
.team-select { font-size: 0.88rem; }
.letter { display: inline-block; min-width: 1.4em; font-weight: 600; }
.toggle { padding: 0 6px; background: none; border: none; color: var(--ink); font-size: 0.9rem; cursor: pointer; min-height: 0; }
button.small { padding: 4px 10px; font-size: 0.85rem; }
button.link { min-height: 0; padding: 2px 4px; background: none; color: var(--ink-2); font-size: 0.85rem; text-decoration: underline; text-underline-offset: 2px; }
button.link:hover { color: var(--ink); background: none; }
button.danger.link, button.small.danger { color: var(--red); }
button.small.danger { background: var(--surface); border-color: var(--line); }
</style>
