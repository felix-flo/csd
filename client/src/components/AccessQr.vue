<script setup lang="ts">
/**
 * 참가자 접속용 QR. 현재 접속 origin 을 그대로 인코딩하므로
 * 운영(https://csd.gaonstack.dev)과 로컬에서 각각 올바른 주소가 나온다.
 */
import { onMounted, ref } from 'vue'
import QRCode from 'qrcode'

const url = window.location.origin
const svg = ref('')

onMounted(async () => {
  svg.value = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })
})
</script>

<template>
  <div class="qr">
    <div class="qr-box" v-html="svg" />
    <div class="qr-url">{{ url.replace(/^https?:\/\//, '') }}</div>
    <div class="muted">카메라로 스캔한 뒤 4자리 PIN 으로 로그인</div>
  </div>
</template>

<style scoped>
.qr { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
.qr-box { width: min(280px, 60vw); background: #fff; padding: 8px; border: 1px solid var(--line); border-radius: var(--radius); }
.qr-box :deep(svg) { display: block; width: 100%; height: auto; }
.qr-url { font-family: var(--font-mono); font-size: 1.3rem; font-weight: 600; letter-spacing: 0.02em; word-break: break-all; }
</style>
