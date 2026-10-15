<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import ToastHost from './components/ToastHost.vue'
import VersionBanner from './components/VersionBanner.vue'

const auth = useAuthStore()
onMounted(() => auth.bootstrap())
</script>

<template>
  <div v-if="!auth.ready" class="page muted">로딩 중…</div>
  <template v-else>
    <VersionBanner />
    <RouterView />
    <ToastHost />
  </template>
</template>
