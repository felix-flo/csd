<script setup lang="ts">
/**
 * 알림음 미리듣기·설정. 후보를 들어 보고 이 기기에서 쓸 소리를 고른다.
 * 소리는 프레젠테이션·참가자에게만 나며(관리자 제외), 선택과 끄기는 기기별(localStorage)로 저장된다.
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toasts'
import { CHIMES, DEFAULT_CHIME, getChimeId, playChime, setChimeId, unlockAudio } from '../lib/chime'

const auth = useAuthStore()
const toasts = useToastStore()
const router = useRouter()
const selected = ref(getChimeId())
const playing = ref<string | null>(null)
const blocked = ref(false)

async function preview(id: string) {
  unlockAudio()
  playing.value = id
  const ok = await playChime(id)
  blocked.value = !ok
  setTimeout(() => { if (playing.value === id) playing.value = null }, 1500)
}

function choose(id: string) {
  selected.value = id
  setChimeId(id)
}

function testToast() {
  toasts.show({
    id: -Date.now(),
    type: 'notice',
    scope: 'all',
    targetId: null,
    targetRole: null,
    targetName: null,
    payload: { message: '알림음 테스트입니다.' },
    createdBy: null,
    createdAt: new Date().toISOString(),
  })
}
</script>

<template>
  <div class="page" style="max-width: 720px">
    <div class="topbar">
      <h1 style="margin: 0">알림음</h1>
      <div class="row">
        <button class="secondary" @click="router.push(auth.homePath)">돌아가기</button>
      </div>
    </div>

    <div class="card">
      <p class="muted" style="margin-top: 0">
        전체 공지와 시스템 알림이 도착하면 팝업과 함께 한 번 울립니다. 그룹·개인 대상 알림은 팝업만 뜨고 소리는 나지 않습니다.
        프레젠테이션·참가자 화면에서만 나고, 관리자에게는 나지 않습니다. 선택은 이 기기(브라우저)에만 저장됩니다.
      </p>
      <p v-if="!toasts.sound" class="badge warn">현재 계정({{ auth.user?.role }})은 알림음 대상이 아니라 미리듣기만 됩니다.</p>
      <p v-if="blocked" class="badge off">브라우저가 소리를 막았습니다. 화면을 한 번 클릭한 뒤 다시 눌러 보세요.</p>

      <ul class="chimes">
        <li v-for="c in CHIMES" :key="c.id" :class="{ selected: c.id === selected }">
          <div class="info">
            <strong>{{ c.label }}</strong>
            <span v-if="c.id === DEFAULT_CHIME" class="badge">기본</span>
            <div class="muted">{{ c.hint }}</div>
          </div>
          <div class="row">
            <button class="secondary" :disabled="playing === c.id" @click="preview(c.id)">▶ 듣기</button>
            <button :class="{ secondary: c.id !== selected }" @click="choose(c.id)">{{ c.id === selected ? '사용 중' : '이 소리 사용' }}</button>
          </div>
        </li>
      </ul>

      <div class="row" style="margin-top: 16px; justify-content: space-between">
        <label class="row" style="gap: 6px">
          <input type="checkbox" :checked="toasts.muted" @change="toasts.setMuted(($event.target as HTMLInputElement).checked)" />
          이 기기에서 알림음 끄기
        </label>
        <button class="secondary" @click="testToast">팝업+소리 테스트</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chimes { list-style: none; padding: 0; margin: 12px 0 0; }
.chimes li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--line-soft);
  flex-wrap: wrap;
}
.chimes li.selected { background: var(--blue-bg); margin: 0 -12px; padding-left: 12px; padding-right: 12px; }
.info { flex: 1 1 260px; }
.info strong { margin-right: 6px; }
</style>
