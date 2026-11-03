<script setup lang="ts">
/** 우리 팀 카드. 오프닝과 게임 화면이 같은 모양을 쓴다. 리더가 정해지면 리더와 팀원을 위아래로 나눈다. 정해지기 전에는 팀원만 (hideLeader) */
import { computed } from 'vue'

const props = defineProps<{ members: { id: number; name: string; isLeader?: boolean }[]; hideLeader?: boolean }>()
const leader = computed(() => (props.hideLeader ? null : props.members.find((m) => m.isLeader) ?? null))
const others = computed(() => props.members.filter((m) => m !== leader.value))
</script>

<template>
  <div class="card roster">
    <section v-if="leader">
      <h2>리더</h2>
      <p>{{ leader.name }}</p>
    </section>
    <section v-if="others.length">
      <h2>팀원</h2>
      <ul>
        <li v-for="m in others" :key="m.id">{{ m.name }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.roster { display: flex; flex-direction: column; gap: 12px; }
.roster section + section { padding-top: 12px; border-top: 1px solid var(--line-soft); }
.roster h2 { font-size: 0.87rem; color: var(--muted); margin-bottom: 6px; }
.roster p { margin: 0; font-weight: 600; }
.roster ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 14px; }
</style>
