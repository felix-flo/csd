import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { config } from './config.js'
import { runMigrations } from './db/index.js'
import { seed } from './db/seed.js'
import { listGroups, rehashPins } from './db/users.js'
import { isTabLogin } from './db/game.js'
import { ensureLeader, ensureTeams } from './db/teams.js'
import { seedDefaultRulesIfPristine } from './db/rulesDefaults.js'
import { pruneRefreshTokens } from './auth/tokens.js'
import { authRouter } from './routes/auth.js'
import { apiRouter } from './routes/api.js'
import { initRealtime } from './realtime/index.js'

runMigrations()
rehashPins() // PIN 규약(대문자) 정규화 + PIN_SECRET 변경 시 해시 복구
ensureTeams() // 기본 4팀 생성 + 옛 그룹(e, f, …) 정리
seedDefaultRulesIfPristine() // 룰이 초기 상태면 server/rules/*.md 를 넣는다 (docs/98 §6)
if (config.seedOnStart) seed()
for (const t of listGroups()) ensureLeader(t.id) // 팀당 리더 1명 (시드·옛 데이터 정리)
pruneRefreshTokens()

const app = express()
app.disable('x-powered-by')
// cloudflared → traefik → app : 프록시 2단계
app.set('trust proxy', 2)
app.use(helmet({ contentSecurityPolicy: false }))
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())

/** 클라이언트 빌드 식별자. client/dist/version.json (vite 빌드가 생성). 없으면 'dev' */
function readClientVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(config.clientDist, 'version.json'), 'utf8')
    return String((JSON.parse(raw) as { version?: string }).version ?? 'dev')
  } catch {
    return 'dev'
  }
}
const clientVersion = readClientVersion()

// tabLogin: 테스트 모드(탭 로그인, docs/101). 로그인 화면이 안내 문구를 띄우는 데 쓴다
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, ts: new Date().toISOString(), version: clientVersion, tabLogin: isTabLogin() }),
)
app.use('/api/auth', authRouter)
app.use('/api', apiRouter)

// 운영진 미디어 (오프닝 영상 등). data/media 에 파일만 두면 /media/<파일> 로 열린다. 폴더가 없어도 서버는 뜬다
app.use('/media', express.static(config.mediaDir, { index: false, maxAge: '1h', dotfiles: 'ignore' }))

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
  console.log(`[csd] ${config.nodeEnv} server listening on :${config.port} (db: ${config.dbPath}, client: ${clientVersion})`)
})

// docker stop 시 정상 종료
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[csd] ${sig} received, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
