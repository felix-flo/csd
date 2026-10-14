import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken, type AccessClaims } from './tokens.js'
import { isUserActive } from '../db/users.js'
import type { Role } from '../../../shared/types.js'

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AccessClaims
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const claims = token ? verifyAccessToken(token) : null
  // access token 수명(15분) 안에 비활성화된 계정도 즉시 차단
  if (!claims || !isUserActive(claims.sub)) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  req.auth = claims
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
