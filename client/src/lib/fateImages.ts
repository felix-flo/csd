/**
 * 운명의 카드 이미지 (docs/100 N4). 560×747 webp (화면 최대 280px × 2배).
 * 카드 창이 뜨기 전(이름 입력·팀 선택 화면)에 미리 받아 두어, 창이 뜰 때 바로 보이게 한다.
 */
import angelUrl from '../assets/angel.webp'
import devilUrl from '../assets/devil.webp'

export { angelUrl, devilUrl }
export const FATE_IMAGE_SIZE = { width: 560, height: 747 } as const

let preloaded = false

/** 한 번만 백그라운드로 받는다. 받은 파일은 브라우저 캐시에 남아 카드 창의 <img> 가 그대로 쓴다 */
export function preloadFateImages() {
  if (preloaded) return
  preloaded = true
  for (const src of [angelUrl, devilUrl]) {
    const img = new Image()
    img.decoding = 'async'
    img.src = src
  }
}
