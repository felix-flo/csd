import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { db } from '../db/index.js'
import type { PublicUser, Role } from '../../../shared/types.js'

export interface AccessClaims {
  sub: number
  role: Role
  groupId: number | null
  isLeader: boolean
}

/** PIN 은 영문 소문자 4자리. DB 에는 HMAC 으로만 저장하고 평문은 남기지 않는다. */
export const PIN_PATTERN = /^[a-z]{4}$/

export function hashPin(pin: string): string {
  return crypto.createHmac('sha256', config.pinSecret).update(pin).digest('hex')
}

export function signAccessToken(user: PublicUser): string {
  const claims: AccessClaims = {
    sub: user.id,
    role: user.role,
    groupId: user.groupId,
    isLeader: user.isLeader,
  }
  return jwt.sign(claims, config.jwtSecret, {
    expiresIn: config.accessTokenTtl as jwt.SignOptions['expiresIn'],
  })
}

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload & AccessClaims
    return { sub: Number(decoded.sub), role: decoded.role, groupId: decoded.groupId, isLeader: decoded.isLeader }
  } catch {
    return null
  }
}

// ---- refresh token: 불투명 랜덤 문자열, DB 에는 SHA-256 만 저장, 사용 시마다 회전(rotate) ----

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex')
}

export function issueRefreshToken(userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000).toISOString()
  db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId,
    sha256(token),
    expires,
  )
  return token
}

/** 유효하면 기존 토큰을 폐기하고 새 토큰 발급. 아니면 null */
export function rotateRefreshToken(token: string): { userId: number; token: string } | null {
  const row = db
    .prepare(
      `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?`,
    )
    .get(sha256(token)) as
    | { id: number; user_id: number; expires_at: string; revoked_at: string | null }
    | undefined
  if (!row || row.revoked_at || new Date(row.expires_at) < new Date()) return null

  const next = db.transaction(() => {
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?`).run(row.id)
    return issueRefreshToken(row.user_id)
  })()
  return { userId: row.user_id, token: next }
}

export function revokeRefreshToken(token: string) {
  db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ?`).run(
    sha256(token),
  )
}

/** 특정 유저의 refresh 토큰 전부 폐기 (계정 비활성화 시) */
export function revokeUserRefreshTokens(userIds: number[]) {
  if (userIds.length === 0) return
  const placeholders = userIds.map(() => '?').join(',')
  db.prepare(
    `UPDATE refresh_tokens SET revoked_at = datetime('now')
     WHERE revoked_at IS NULL AND user_id IN (${placeholders})`,
  ).run(...userIds)
}

/** 만료/폐기된 토큰 정리 (기동 시 1회) */
export function pruneRefreshTokens() {
  db.prepare(
    `DELETE FROM refresh_tokens WHERE revoked_at IS NOT NULL OR expires_at < datetime('now')`,
  ).run()
}
