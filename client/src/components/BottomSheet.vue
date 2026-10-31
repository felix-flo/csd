<script setup lang="ts">
/**
 * 아래에서 올라오는 시트 (docs/107). 거래·전쟁·라이프 제출·발행·이주·투표·설정을 띄운다.
 * 팀 색 변수를 이어받도록 Teleport 하지 않는다. 안쪽 패널의 카드 모양은 없애고 내용만 보여 준다.
 */
import Icon from './Icon.vue'

defineProps<{ title?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="scrim" @click="emit('close')"></div>
  <div class="sheet" role="dialog" aria-modal="true" :aria-label="title">
    <div class="grip" aria-hidden="true"></div>
    <button class="close" type="button" aria-label="닫기" @click="emit('close')"><Icon name="close" /></button>
    <h3 v-if="title">{{ title }}</h3>
    <slot />
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 800; background: rgba(0, 0, 0, 0.42); }
.sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 801; max-width: 480px; max-height: 86vh; max-height: 86dvh; margin: 0 auto; overflow-y: auto; padding: 10px 16px calc(18px + env(safe-area-inset-bottom)); background: #15171c; color: #f4f6fa; border-top: 3px solid var(--team-line, #f4f6fa); }
.grip { width: 44px; height: 4px; margin: 0 auto 12px; background: #6a7283; }
.close { position: absolute; top: 8px; right: 8px; width: 40px; height: 40px; display: grid; place-items: center; padding: 0; background: none; border: 0; color: #f4f6fa; font-size: 22px; }
.close:hover { background: none; color: #f4f6fa; }
h3 { margin: 0 40px 0 0; font-family: var(--font-play); font-weight: 400; font-size: 25px; line-height: 1.15; }
/* 안쪽 패널 공통: 카드 모양 없이 제목 · 안내(hint) · 표(lines·line) · 버튼 줄(acts) · 고르기(picks·pick). 주요 버튼은 팀 색 */
.sheet :deep(.card) { margin: 0; padding: 0; background: none; border: 0; box-shadow: none; }
.sheet :deep(.card > h2) { margin: 0 40px 0 0; font: 400 25px/1.15 var(--font-play); letter-spacing: 0; text-transform: none; }
.sheet :deep(.hint) { margin: 10px 0 0; font-size: 15.5px; font-weight: 600; line-height: 1.4; word-break: keep-all; }
.sheet :deep(.hint strong) { font-weight: 800; }
.sheet :deep(.hint .icon) { vertical-align: -2px; }
.sheet :deep(.error) { margin: 10px 0 0; color: #ff6b6b; font-size: 15.5px; font-weight: 700; }
.sheet :deep(.lines) { margin-top: 12px; border: 2px solid #4b5262; }
.sheet :deep(.line) { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 6px 10px; font-size: 18px; font-weight: 800; word-break: keep-all; }
.sheet :deep(.line + .line) { border-top: 2px solid #343946; }
.sheet :deep(.line > span) { flex: none; width: 82px; font-size: 14.5px; font-weight: 600; }
.sheet :deep(.line > em) { flex: none; margin-left: auto; font-size: 14.5px; font-style: normal; font-weight: 600; }
.sheet :deep(.acts) { display: flex; gap: 6px; margin-top: 12px; }
.sheet :deep(.acts > button) { flex: 1 1 0; min-width: 0; height: 54px; padding: 0 8px; font-size: 17px; font-weight: 800; }
.sheet :deep(.acts > .go) { flex: 2 1 0; }
.sheet :deep(.field) { flex: 1 1 0; min-width: 0; height: 54px; padding: 0 10px; background: #101216; border: 2px solid #6a7283; color: #f4f6fa; font: 800 22px 'Archivo', sans-serif; }
.sheet :deep(.picks) { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 6px; margin-top: 12px; }
.sheet :deep(.pick), .sheet :deep(.pick:hover) { display: flex; align-items: center; justify-content: center; gap: 8px; height: 54px; padding: 0 6px; background: #101216; border: 2px solid #6a7283; color: #f4f6fa; font-size: 17px; font-weight: 800; }
.sheet :deep(.pick.on), .sheet :deep(.pick.on:hover) { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
.sheet :deep(.pick.on .icon) { color: inherit; }
.sheet :deep(button) { letter-spacing: 0; text-transform: none; }
.sheet :deep(.card button:not(.secondary):not(.danger):not(.pick)), .sheet :deep(.card button:not(.secondary):not(.danger):not(.pick):hover) { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
.sheet :deep(button.secondary), .sheet :deep(button.secondary:hover) { background: none; border-color: #6a7283; color: #f4f6fa; }
.sheet :deep(button.danger), .sheet :deep(button.danger:hover) { background: #d4141c; border-color: #d4141c; color: #fff; }
.sheet :deep(.wide) { width: 100%; height: 54px; margin-top: 12px; font-size: 17px; font-weight: 800; }
</style>
