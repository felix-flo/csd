/**
 * 값을 조금 늦게 따라가는 ref. 재화가 바뀌면 알림(공지·알림음)이 먼저 나오고 숫자 효과가 뒤따르게 한다.
 * 처음 값과 비어 있다가 생긴 값은 바로 반영한다. 기다리는 중 또 바뀌면 마지막 값 하나로 합쳐서 반영한다
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export const RESOURCE_DELAY = 1000

export function useDelayed<T>(source: () => T, onShow?: (now: T, before: T) => void, ms = RESOURCE_DELAY): Ref<T> {
  const shown = ref(source()) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => JSON.stringify(source()),
    () => {
      clearTimeout(timer)
      const now = source()
      if (now == null || shown.value == null) {
        shown.value = now
        return
      }
      timer = setTimeout(() => {
        const before = shown.value
        shown.value = now
        onShow?.(now, before)
      }, ms)
    },
  )
  onBeforeUnmount(() => clearTimeout(timer))
  return shown
}
