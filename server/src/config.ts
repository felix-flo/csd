import path from 'node:path'

const env = process.env

function required(name: string, devDefault: string): string {
  const v = env[name]
  if (v && v !== '' && !v.startsWith('change-me')) return v
  if (env.NODE_ENV === 'production') {
    throw new Error(`[config] 환경변수 ${name} 이(가) 설정되지 않았습니다. .env 를 확인하세요.`)
  }
  console.warn(`[config] ${name} 미설정 → 개발용 기본값 사용`)
  return devDefault
}

export const config = {
  nodeEnv: env.NODE_ENV ?? 'development',
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT ?? 3000),
  dbPath: env.DB_PATH ?? path.resolve(process.cwd(), '../data/csd.sqlite'),
  jwtSecret: required('JWT_SECRET', 'dev-jwt-secret'),
  pinSecret: required('PIN_SECRET', 'dev-pin-secret'),
  /** 액세스 토큰 수명 (일반 모드, docs/101). .env 가 있으면 그 값이 우선 */
  accessTokenTtl: env.ACCESS_TOKEN_TTL ?? '1h',
  /** 테스트 모드(탭 로그인) 액세스 토큰 수명. 재발급이 없으므로 더 길게 (2026-10-30 결정: 3시간) */
  tabAccessTokenTtl: env.TAB_ACCESS_TOKEN_TTL ?? '3h',
  /** 리프레시 토큰 수명(ms). REFRESH_TOKEN_TTL_HOURS 기본 12. 예전 REFRESH_TOKEN_TTL_DAYS 가 있으면 그 값(일) 우선 */
  refreshTokenTtlMs: env.REFRESH_TOKEN_TTL_DAYS
    ? Number(env.REFRESH_TOKEN_TTL_DAYS) * 86_400_000
    : Number(env.REFRESH_TOKEN_TTL_HOURS ?? 12) * 3_600_000,
  cookieSecure: (env.COOKIE_SECURE ?? (env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true',
  seedOnStart: (env.SEED_ON_START ?? 'true') === 'true',
  /** 빌드된 Vue 정적 파일 위치 (단일 컨테이너 구성) */
  clientDist: env.CLIENT_DIST ?? path.resolve(process.cwd(), '../client/dist'),
}
