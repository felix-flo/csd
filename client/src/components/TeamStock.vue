<script setup lang="ts">
/**
 * 우리 팀 재화 카드. 오프닝과 게임 화면이 같은 모양을 쓴다.
 * 재화가 바뀌면 알림이 먼저 나오도록 잠깐 늦게 반영하고, 숫자가 굴러가는 동안 소리를 내며 휴대폰이 진동한다
 */
import { RESOURCE_KINDS, type Resources } from '../../../shared/game'
import { playCount } from '../lib/chime'
import { useDelayed } from '../lib/delayed'
import { vibrateCount } from '../lib/haptic'
import ResourceRow from './ResourceRow.vue'

const props = defineProps<{ resources?: Resources }>()

const shown = useDelayed(
  () => (props.resources ? { ...props.resources } : undefined),
  (now, before) => {
    if (!now || !before) return
    const diffs = RESOURCE_KINDS.map((k) => now[k] - before[k])
    const up = diffs.some((d) => d < 0) ? false : diffs.some((d) => d > 0) ? true : null
    if (up == null) return
    vibrateCount(up)
    void playCount(up)
  },
)
</script>

<template>
  <div class="card stock"><ResourceRow grid animated :amounts="shown" /></div>
</template>

<style scoped>
.stock { padding: 0; }
</style>
