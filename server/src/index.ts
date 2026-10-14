import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { config } from './config.js'
import { runMigrations } from './db/index.js'
import { seed } from './db/seed.js'
import { pruneRefreshTokens } from './auth/tokens.js'
import { authRouter } from './routes/auth.js'
import { apiRouter } from './routes/api.js'
import { initRealtime } from './realtime/index.js'

runMigrations()
if (config.seedOnStart) seed()
pruneRefreshTokens()

const app = express()
app.disable('x-powered-by')
// cloudflared → traefik → app : 프록시 2단계
app.set('trust proxy', 2)
app.use(helmet({ contentSecurityPolicy: false }))
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))
app.use('/api/auth', authRouter)
app.use('/api', apiRouter)

// ---- 단일 컨테이너: 빌드된 Vue 앱 서빙 (SPA fallback) ----
const indexHtml = path.join(config.clientDist, 'index.html')
if (fs.existsSync(indexHtml)) {
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }))
  app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(indexHtml)
  })
} else {
  console.warn(`[static] client build 없음 (${config.clientDist}). 개발 중이면 vite dev 서버를 사용하세요.`)
}

// 404 / 에러 핸들러
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
})

const server = http.createServer(app)
initRealtime(server)

server.listen(config.port, () => {
  console.log(`[csd] ${config.nodeEnv} server listening on :${config.port} (db: ${config.dbPath})`)
})

// docker stop 시 정상 종료
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[csd] ${sig} received, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
