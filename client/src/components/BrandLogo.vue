<script setup lang="ts">
/**
 * "더 트래픽 커뮤니티" 전용 로고. 글자색을 따른다. 게임 시작 전에는 쓰지 않는다.
 * unfold: 오프닝 연출. "더 커뮤니티"로 나왔다가 사이가 벌어지면서 "트래픽"이 나타난다.
 */
withDefaults(defineProps<{ height?: number | string; unfold?: boolean }>(), { height: 32 })
</script>

<template>
  <svg class="brand-logo" :class="{ unfold }" role="img" aria-label="더 트래픽 커뮤니티" viewBox="0 0 1804 320" :style="{ height: typeof height === 'number' ? `${height}px` : height }" fill="none" stroke="currentColor" stroke-width="34">
    
    <g class="the"><path transform="translate(0 0)" d="M104 17H17V241A62 62 0 0 0 79 303H104M112 150H169M169 0V320"/></g>
    <g class="traffic"><path transform="translate(260 0)" d="M152 17H17V174A62 62 0 0 0 79 236H152M17 126H138M0 303H168"/><path transform="translate(454 0)" d="M0 17H56A42 42 0 0 1 98 59V160H17V241A62 62 0 0 0 79 303H106M152 0V320M152 150H225M225 0V320"/><path transform="translate(722 0)" d="M4 17H150M4 156H150M46 17V156M108 17V156M197 0V190M0 221H154A43 43 0 0 1 197 264V320"/></g>
    <g class="community"><path transform="translate(1010 0)" d="M0 17A92 92 0 0 1 92 109V320M0 150H156M173 0V320"/><path transform="translate(1226 0)" d="M17 17H173V165H17ZM0 224H190M56 241V320M134 241V320"/><path transform="translate(1442 0)" d="M17 0V219A84 84 0 0 0 101 303H114M149 0V320"/><path transform="translate(1634 0)" d="M112 17H17V241A62 62 0 0 0 79 303H112M17 150H100M153 0V320"/></g>
  
  </svg>
</template>

<style scoped>
.brand-logo { display: block; width: auto; flex: none; overflow: visible; }
/* 트래픽이 빠진 폭(750)의 절반씩 안쪽으로 모아 두었다가 벌린다. 로고가 나타나기 시작하고 1초 뒤 벌어진다 */
.unfold .the { animation: unfold-the 1.8s cubic-bezier(0.7, 0, 0.2, 1) 1s both; }
.unfold .community { animation: unfold-community 1.8s cubic-bezier(0.7, 0, 0.2, 1) 1s both; }
.unfold .traffic { animation: unfold-traffic 1.2s ease-out 1.7s both; }
@keyframes unfold-the { from { transform: translateX(375px); } to { transform: none; } }
@keyframes unfold-community { from { transform: translateX(-375px); } to { transform: none; } }
@keyframes unfold-traffic { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .unfold * { animation: none !important; } }
</style>
