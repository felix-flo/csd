<script setup lang="ts">
/**
 * 리더 선정 (팀원 화면, docs/100 §7-6). 투표가 아니라 팀이 오프라인에서 협의해 진행자에게 알리면 진행자가 지정한다.
 * 여기서는 안내와 현재 리더·지정 완료 여부만 보여 준다. 팀원이 1명이면 자동 리더.
 */
import { computed } from 'vue'
import type { PublicUser } from '../../../shared/types'
import type { ElectionView } from '../../../shared/game'
import { useAuthStore } from '../stores/auth'

const props = defineProps<{ members: PublicUser[]; election: ElectionView | null }>()
const auth = useAuthStore()
const leader = computed(() => props.members.find((m) => m.isLeader) ?? null)
const done = computed(() => props.election?.status === 'done')
</script>

<template>
  <div class="card">
    <h2>리더 선정</h2>
    <template v-if="done">
      <p><span class="badge on">지정 완료</span> 이번 라운드 리더: <strong>{{ leader?.name ?? '-' }}</strong><span v-if="leader?.id === auth.user?.id" class="muted"> (나)</span></p>
    </template>
    <template v-else>
      <p>팀에서 협의해 리더를 정한 뒤 <strong>진행자에게 알려 주세요.</strong> 진행자가 지정하면 여기에 표시됩니다.</p>
      <p class="muted" style="margin: 8px 0 0">
        현재 리더: <strong>{{ leader?.name ?? '없음' }}</strong><span v-if="leader?.id === auth.user?.id"> (나)</span>
        · 지정 없이 단계가 넘어가면 현재 리더가 유지됩니다.
      </p>
    </template>
  </div>
</template>
