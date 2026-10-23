import { Router } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { findUserById, findUserByPinHash, touchLogin } from '../db/users.js'
import { getGameRow } from '../db/game.js'
import { signalLobby } from '../realtime/index.js'
import { requireAuth } from '../auth/middleware.js'
import {
  PIN_PATTERN,
  hashPin,
  normalizePin,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../auth/tokens.js'
import type { LoginResponse, RefreshResponse } from '../../../shared/types.js'

export const authRouter = Router()

const REFRESH_COOKIE = 'csd_refresh'
const cookieOpts = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: config.refreshTokenTtlDays * 86_400_000,
}

// 4자리 영문·숫자 PIN 은 경우의 수가 적으므로(36^4 ≈ 168만) 로그인 시도는 반드시 제한한다.
// 실패만 센다: 행사장 와이파이는 모두 같은 공인 IP 로 나가므로 성공까지 세면 준비 단계에 한꺼번에 로그인할 때 막힌다.
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // cloudflared → traefik → app 경로이므로 Cloudflare 가 넣어주는 실제 클라이언트 IP 우선
  keyGenerator: (req) => {
    const cf = req.headers['cf-connecting-ip']
    return ipKeyGenerator(typeof cf === 'string' && cf ? cf : (req.ip ?? ''))
  },
  message: { error: 'too_many_attempts' },
})

// 대소문자 구분 없음: 먼저 대문자로 정규화한 뒤 형식을 검사한다
const loginSchema = z.object({ pin: z.string().max(16).transform(normalizePin).pipe(z.string().regex(PIN_PATTERN)) })

authRouter.post('/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_pin_format' })
    return
  }
  const user = findUserByPinHash(hashPin(parsed.data.pin))
  if (!user) {
    res.status(401).json({ error: 'invalid_pin' })
    return
  }
  touchLogin(user.id)
  // 준비 상태에서 참가자가 들어오면 관리자 화면의 "참가자 PIN" 상태(접속함)를 바로 갱신
  if (user.role === 'member' && getGameRow().status === 'ready') signalLobby()
  const refresh = issueRefreshToken(user.id)
  res.cookie(REFRESH_COOKIE, refresh, cookieOpts)
  const body: LoginResponse = { accessToken: signAccessToken(user), user }
  res.json(body)
})

authRouter.post('/refresh', (req, res) => {
  const current = req.cookies?.[REFRESH_COOKIE] as string | undefined
  const rotated = current ? rotateRefreshToken(current) : null
  const user = rotated ? findUserById(rotated.userId) : null
  if (!rotated || !user) {
    res.clearCookie(REFRESH_COOKIE, { path: cookieOpts.path })
    res.status(401).json({ error: 'invalid_refresh' })
    return
  }
  res.cookie(REFRESH_COOKIE, rotated.token, cookieOpts)
  const body: RefreshResponse = { accessToken: signAccessToken(user) }
  res.json(body)
})

authRouter.post('/logout', (req, res) => {
  const current = req.cookies?.[REFRESH_COOKIE] as string | undefined
  if (current) revokeRefreshToken(current)
  res.clearCookie(REFRESH_COOKIE, { path: cookieOpts.path })
  res.status(204).end()
})

// 토큰 검증 확인용
authRouter.get('/check', requireAuth, (req, res) => {
  const { user, ...auth } = req.auth!
  res.json({ ok: true, auth, user })
})
