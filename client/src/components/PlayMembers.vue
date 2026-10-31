<script setup lang="ts">
/** 팀원 영역 (docs/107): 기본으로 펼쳐 둔다. 접으면 리더와 "외 N명"만 */
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import type { PublicUser } from '../../../shared/types'

const props = defineProps<{ members: PublicUser[] }>()
const open = ref(true)
const leader = computed(() => props.members.find((m) => m.isLeader) ?? null)
const others = computed(() => props.members.filter((m) => m.id !== leader.value?.id))
</script>

<template>
  <section class="area">
    <h2 class="ttl">팀원 {{ members.length }}명</h2>
    <button class="row-btn" type="button" :aria-expanded="open" @click="open = !open">
      <span v-if="leader" class="tag">리더</span><span class="who">{{ leader?.name ?? '리더 없음' }}</span>
      <template v-if="others.length">
        <span class="more">{{ open ? '접기' : `외 ${others.length}명` }}</span>
        <Icon name="chevron" class="chev" :class="{ up: open }" />
      </template>
    </button>
    <ul v-if="open" class="names">
      <li v-for="m in others" :key="m.id">{{ m.name }}</li>
    </ul>
  </section>
</template>

<style scoped>
.row-btn { width: 100%; min-height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: none; border: 0; color: #f4f6fa; font-size: 18px; font-weight: 700; letter-spacing: 0; text-align: left; text-transform: none; }
.row-btn:hover { background: none; color: #f4f6fa; }
.tag { flex: none; padding: 3px 7px; background: #f4f6fa; color: #101216; font-size: 13px; font-weight: 800; line-height: 1.2; }
.who { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.more { flex: none; margin-left: auto; font-size: 15.5px; font-weight: 600; }
.chev { flex: none; margin-left: -4px; font-size: 20px; stroke-width: 2.6; }
.chev.up { transform: rotate(180deg); }
.names { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 8px; margin: 0; padding: 0 12px 2px; list-style: none; }
.names li { display: flex; align-items: center; min-height: 30px; overflow: hidden; font-size: 17px; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
</style>
