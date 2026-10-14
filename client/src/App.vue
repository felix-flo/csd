<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
onMounted(() => auth.bootstrap())
</script>

<template>
  <div v-if="!auth.ready" class="page muted">로딩 중…</div>
  <RouterView v-else />
</template>
