import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 개발 시 vite(5173) 가 /api, /socket.io 를 express(3000) 로 프록시 → 운영과 동일한 same-origin 동작
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
    fs: { allow: ['..'] },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
