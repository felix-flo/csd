<script setup lang="ts">
/** 최신 알림 하나를 화면 위에 고정한다. 다음 알림이 오면 바뀌고, 누르면 지난 알림을 볼 수 있다 (open) */
import Icon from './Icon.vue'
import { useNoticeStore, type Notice } from '../stores/notices'

const notices = useNoticeStore()
defineEmits<{ open: [notice: Notice] }>()
</script>

<template>
  <button v-if="notices.latest" class="notice-bar" :class="{ war: notices.latest.war }" type="button" role="status" @click="$emit('open', notices.latest!)">
    <Icon name="megaphone" />
    <span class="text">{{ notices.latest.message }}</span>
    <span class="more">{{ notices.latest.link ? '보기' : '전체 보기' }}</span>
  </button>
</template>
