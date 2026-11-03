<script setup lang="ts">
/**
 * 네 칸 문장. 왼쪽 위 화이트, 오른쪽 위 블루, 왼쪽 아래 레드, 오른쪽 아래 골드.
 * team(팀 코드)을 주면 그 칸만 팀색으로 칠한다. all 은 네 칸을 모두 칠한다. 선은 크기와 상관없이 1px.
 * 게임 시작 전에는 게임을 드러내므로 쓰지 않는다.
 */
withDefaults(defineProps<{ team?: string | null; all?: boolean; size?: number | string; light?: boolean }>(), { size: 32 })
const CELLS = {
  white: { cell: 'M8 76V62A52 52 0 0 1 60 10V76Z', pat: 'M34 40l15 15-15 15-15-15z' },
  blue: { cell: 'M60 10A52 52 0 0 1 112 62V76H60Z', pat: 'M60 58a18 18 0 0 1 18 18M60 40a36 36 0 0 1 36 36M60 22a54 54 0 0 1 52 40' },
  red: { cell: 'M8 76H60V142H8Z', pat: 'M16 136h14v-14h14v-14h14' },
  yellow: { cell: 'M60 76H112V142H60Z', pat: 'M83 94a9 9 0 1 0-18 0 9 9 0 0 0 18 0M107 94a9 9 0 1 0-18 0 9 9 0 0 0 18 0M83 118a9 9 0 1 0-18 0 9 9 0 0 0 18 0M107 118a9 9 0 1 0-18 0 9 9 0 0 0 18 0' },
} as const
</script>

<template>
  <svg class="crest" :class="{ light }" :style="{ width: typeof size === 'number' ? `${size}px` : size }" viewBox="0 0 120 150" aria-hidden="true">
    <g v-for="(c, k) in CELLS" :key="k" :class="['c-' + k, { on: all || team === k }]">
      <path class="cell" :d="c.cell" />
      <path class="pat" :d="c.pat" />
    </g>
    <path d="M8 142V62a52 52 0 0 1 104 0v80z" />
    <path d="M60 10v132M8 76h104" />
  </svg>
</template>

<style scoped>
.crest { display: block; flex: none; height: auto; aspect-ratio: 4 / 5; color: var(--ink); overflow: visible; }
.crest.light { color: #fff; }
.crest :deep(path) { fill: none; stroke: currentColor; stroke-width: 1px; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
.crest .cell { stroke: none; }
.c-white { --cf: var(--ink); --cp: #fff; }
.c-yellow { --cf: #f5b800; --cp: var(--ink); }
.c-blue { --cf: var(--blue); --cp: #fff; }
.c-red { --cf: var(--red); --cp: #fff; }
.on .cell { fill: var(--cf); }
.on .pat { stroke: var(--cp); }
</style>
