<script setup lang="ts">
import Icon from './Icon.vue'
/** 재화 1종을 아이콘 + 수량 칩으로 표시. 수량이 없으면 "–". animated 면 바뀔 때 숫자가 굴러가며 강조된다 */
import { computed } from 'vue'
import { RESOURCE_BY_KEY, type ResourceKey } from '../lib/resources'
import CountNumber from './CountNumber.vue'

const props = defineProps<{ kind: ResourceKey; amount?: number | null; large?: boolean; showLabel?: boolean; animated?: boolean }>()
const def = computed(() => RESOURCE_BY_KEY[props.kind])
const text = computed(() => (props.amount == null ? '–' : props.amount.toLocaleString('ko-KR')))
</script>

<template>
  <span class="res" :class="[kind, { lg: large }]" :title="`${def.label} (${def.hint})`">
    <Icon :name="kind" class="res-icon" />
    <span v-if="showLabel" class="res-label">{{ def.label }}</span>
    <span class="res-amount"><CountNumber v-if="animated" :value="amount" /><template v-else>{{ text }}</template></span>
  </span>
</template>
