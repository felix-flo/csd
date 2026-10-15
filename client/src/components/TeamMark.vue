<script setup lang="ts">
/** 팀 색 점. 팀 이름 앞에 붙여 자기 팀 색을 바로 알 수 있게 한다. 밝은 색(화이트)은 테두리를 진하게 */
import { computed } from 'vue'
import { isLightColor } from '../../../shared/teams'

const props = defineProps<{ color?: string | null; size?: 'sm' | 'lg' }>()
const light = computed(() => !!props.color && isLightColor(props.color))
</script>

<template>
  <span class="team-mark" :class="{ light, lg: size === 'lg' }" :style="{ '--team': color ?? undefined }" aria-hidden="true" />
</template>
