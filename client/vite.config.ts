import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 빌드 식별자. 클라이언트 번들(__BUILD_ID__)과 dist/version.json 에 같은 값을 넣고,
 * 서버가 version.json 을 읽어 /api/health 로 내려준다. 둘이 다르면 클라이언트가 "새 버전" 배너를 띄운다.
 * 개발 서버(vite dev)에서는 'dev' 로 고정 (서버도 dist 가 없으면 'dev').
 */
const buildId = process.env.BUILD_ID ?? new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

function versionFile(): Plugin {
  return {
    name: 'csd-version-file',
    apply: 'build',
    closeBundle() {
      fs.writeFileSync(path.resolve(__dirname, 'dist/version.json'), JSON.stringify({ version: buildId }))
    },
  }
}

// 개발 시 vite(5173) 가 /api, /socket.io 를 express(3000) 로 프록시 → 운영과 동일한 same-origin 동작
export default defineConfig(({ command }) => ({
  plugins: [vue(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? buildId : 'dev') },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
    fs: { allow: ['..'] },
  },
  build: { outDir: 'dist', emptyOutDir: true },
}))
