import { ref } from 'vue'

/**
 * 앱 팝업으로 묻는 확인 (ConfirmHost). 브라우저 confirm 은 쓰지 않는다:
 * iframe 이나 앱 내장 브라우저에서는 창 없이 바로 false 가 돌아와 버튼이 아무 일도 안 하는 것처럼 보인다.
 */
export const confirmAsk = ref<{ message: string; resolve: (ok: boolean) => void } | null>(null)

export function askConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmAsk.value = { message, resolve }
  })
}
