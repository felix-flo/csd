import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken } from './tokens.js'
import { findUserById } from '../db/users.js'
import type { PublicUser, Role } from '../../../shared/types.js'

/**
 * 요청 컨텍스트. 토큰은 식별자·역할만 담고, 팀·리더 여부는 **매 요청 DB 에서 읽는다**.
 * 팀 이동·리더 교체가 즉시 반영되고, 비활성화된 계정은 access token 수명 안이라도 바로 차단된다.
 */
export interface AuthContext {
  sub: number
  role: Role
  groupId: number | null
  isLeader: boolean
  user: PublicUser
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const claims = token ? verifyAccessToken(token) : null
  // findUserById 는 active=1 인 계정만 돌려준다
  const user = claims ? findUserById(claims.sub) : null
  if (!user) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  req.auth = { sub: user.id, role: user.role, groupId: user.groupId, isLeader: user.isLeader, user }
  next()
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    next()
  }
}
