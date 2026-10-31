<script setup lang="ts">
/**
 * 인라인 SVG 아이콘 (docs/106 §7). 이모지 대신 쓴다: 기기마다 모양·색이 다른 이모지와 달리 테마 색(currentColor)과 선 굵기를 따르고
 * 빔에서도 또렷하다. 24×24 뷰박스, 2px 선, 크기는 글자 크기(1em)를 따른다. 재화 아이콘은 .res 칩 색을 그대로 받는다.
 * 사용: <Icon name="war" /> · 라벨이 따로 없으면 label 로 접근성 이름을 준다.
 */
export type IconName =
  | 'gem' | 'gold' | 'life' | 'credit'
  | 'timer' | 'council' | 'aid' | 'war' | 'scroll' | 'vote' | 'migration' | 'lock'
  | 'bell' | 'bell-off' | 'mute' | 'spy' | 'sun' | 'moon' | 'flask' | 'warning' | 'refresh' | 'megaphone' | 'film' | 'trophy'

const PATHS: Record<IconName, string> = {
  gem: 'M7 3h10l4 6-9 12L3 9zM3 9h18M10 3 8 9l4 12M14 3l2 6-4 12',
  gold: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z',
  life: 'M12 20.5S4 15.6 4 9.8A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 8 2.5c0 5.8-8 10.7-8 10.7z',
  credit: 'M3 7h18v3.5a1.5 1.5 0 0 0 0 3V17H3v-3.5a1.5 1.5 0 0 0 0-3zM9.5 7v10',
  timer: 'M12 7a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 11v3l2 1.5M10 3h4M12 3v4M18.5 7.5 20 6',
  council: 'M4 4h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM19 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v3l-4-3h-4',
  aid: 'M3 10h18v11H3zM4 6h16v4H4zM12 6v15M12 6c-1.5-2.5-5-2.5-4.5 0h4.5c1.5-2.5 5-2.5 4.5 0z',
  war: 'M4 4l14 14M20 4 6 18M3 18l3 3M21 18l-3 3M15 13l3 3M9 13l-3 3M4 4h3M4 4v3M20 4h-3M20 4v3',
  scroll: 'M6 3h9l5 5v13H6zM15 3v5h5M9 13h6M9 17h6',
  vote: 'M3 12h18v9H3zM7 12l1-8h8l1 8M10 8h4M3 16h18',
  migration: 'M3 8h18v12H3zM9 8V4h6v4M3 13h18M8 8v12M16 8v12',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4M12 3v2',
  'bell-off': 'M6 16v-5a6 6 0 0 1 9.5-4.9M18 13v3l2 2H8M10 21h4M3 3l18 18',
  mute: 'M4 9h4l5-4v14l-5-4H4zM17 9l4 6M21 9l-4 6',
  spy: 'M3 10h18M7 10V6h10v4M3 14a3 3 0 1 0 6 0 3 3 0 1 0-6 0M15 14a3 3 0 1 0 6 0 3 3 0 1 0-6 0M9 14h6',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
  warning: 'M12 3l10 18H2zM12 10v4M12 18h.01',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  megaphone: 'M3 10v4h3l8 5V5l-8 5zM18 9a4 4 0 0 1 0 6',
  film: 'M3 9h18v12H3zM3 9l2-5h16l-2 5M8 4l2 5M13 4l2 5',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6v4',
}

const props = defineProps<{ name: IconName; label?: string }>()
</script>

<template>
  <svg
    class="icon"
    :class="`icon-${name}`"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <path :d="PATHS[props.name]" />
  </svg>
</template>

<style>
/* 전역: 다른 컴포넌트의 scoped 스타일에서 .icon 으로 크기를 조절할 수 있게 한다 */
.icon { width: 1em; height: 1em; vertical-align: -0.15em; flex: none; }
/* 재화 아이콘은 칩 색: 보석 흰색, 골드 금색, 라이프 파랑, 크레딧 빨강 (style.css --res-*-fg).
   클래스는 icon-<name> 으로 접두어를 붙인다 — 부모의 scoped 스타일(.timer, .council, .war 등)과 이름이 겹치지 않게 */
.icon-gem { color: var(--res-gem-fg); }
.icon-gold { color: var(--res-gold-fg); }
.icon-life { color: var(--res-life-fg); }
.icon-credit { color: var(--res-credit-fg); }
</style>
