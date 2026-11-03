import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './style.css'

createApp(App).use(createPinia()).use(router).mount('#app')

// 개발 서버 전용: 네 화면 보기 페이지가 각 화면의 버튼을 이름으로 누를 수 있게 한다
if (import.meta.env.DEV) {
  window.addEventListener('message', (e) => {
    const { click: text, key, tap, show } = (e.data ?? {}) as { click?: string; key?: string; tap?: boolean; show?: string }
    if (show) [...document.querySelectorAll('h2')].find((h) => h.textContent?.includes(show))?.scrollIntoView({ block: 'center' })
    if (key) window.dispatchEvent(new KeyboardEvent('keydown', { key }))
    if (tap) document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    if (!text) return
    const buttons = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text && b.getClientRects().length > 0)
    buttons.at(-1)?.click()
  })
}
