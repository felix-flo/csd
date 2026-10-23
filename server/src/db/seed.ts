/**
 * 개발용 시드 데이터.
 * - 고정 PIN 으로 관리자 / 프레젠테이션 / 그룹별 리더·테스트유저 로그인 가능 (대소문자 구분 없음)
 * - 이미 존재하는 pin_hash 는 건너뛴다 (멱등). 실제 운영 전에는 PIN 전체 교체 필요.
 * 단독 실행: npm run seed  (서버 기동 시 SEED_ON_START=true 면 자동 실행)
 */
import { db, runMigrations } from './index.js'
import { hashPin } from '../auth/tokens.js'
import { DEFAULT_TEAMS } from '../../../shared/teams.js'

export interface SeedUser {
  name: string
  role: 'admin' | 'presenter' | 'member'
  pin: string
  group?: string
  leader?: boolean
}

/** 기본 4팀 (shared/teams.ts). 시드 PIN 접두어는 팀 코드 첫 글자: W / Y / B / R */
export const DEV_GROUPS = DEFAULT_TEAMS

export const DEV_USERS: SeedUser[] = [
  { name: '관리자', role: 'admin', pin: 'ADMN' },
  { name: '프레젠테이션', role: 'presenter', pin: 'SHOW' },
  ...DEV_GROUPS.flatMap(({ code, name }) => [
    { name: `${name} 리더`, role: 'member' as const, pin: `${code[0]!.toUpperCase()}LDR`, group: code, leader: true },
    { name: `${name} 테스트유저`, role: 'member' as const, pin: `${code[0]!.toUpperCase()}MEM`, group: code },
  ]),
]

export function seed() {
  const upsertGroup = db.prepare('INSERT OR IGNORE INTO groups (code, name, team_color) VALUES (?, ?, ?)')
  // 0002 마이그레이션 이전에 만들어진 시드 행: 평문 PIN 백필 (1회)
  const backfill = db.prepare('UPDATE users SET pin = ?, name_set = ? WHERE pin_hash = ? AND pin IS NULL')

  let created = 0
  db.transaction(() => {
    for (const g of DEV_GROUPS) upsertGroup.run(g.code, g.name, g.color)
    for (const u of DEV_USERS) backfill.run(u.pin, u.role === 'member' ? 0 : 1, hashPin(u.pin))
    created = createSeedUsers(DEV_USERS)
  })()
  console.log(`[seed] users created: ${created} (groups: ${DEV_GROUPS.length})`)
}

/**
 * 시드 계정 생성 (같은 PIN 이 이미 있으면 건너뜀). 팀은 code 로 찾고, 팀이 지워졌으면 그 팀 테스트 계정은 만들지 않는다.
 * - 관리자·프레젠테이션: is_fixed=1 (리셋해도 남는다)
 * - 참가자 = 팀별 테스트 계정 (is_test=1). 게임 설정의 "테스트 계정 포함" 으로 게임 참여 여부를 정한다. 팀 최대 인원에는 포함하지 않는다
 * 게임 리셋도 이 함수로 테스트 계정을 다시 만든다.
 */
export function createSeedUsers(users: SeedUser[]): number {
  const findGroup = db.prepare('SELECT id FROM groups WHERE code = ?')
  const userExists = db.prepare('SELECT 1 FROM users WHERE pin_hash = ?')
  const insertUser = db.prepare(
    'INSERT INTO users (name, role, group_id, is_leader, pin, pin_hash, name_set, is_test, is_fixed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  let created = 0
  for (const u of users) {
    const pinHash = hashPin(u.pin)
    if (userExists.get(pinHash)) continue
    const group = u.group ? (findGroup.get(u.group) as { id: number } | undefined) : undefined
    if (u.group && !group) continue
    const member = u.role === 'member'
    // 시드 참가자는 name_set=0 으로 두어 첫 로그인 이름 입력 흐름을 테스트할 수 있게 한다
    insertUser.run(u.name, u.role, group?.id ?? null, u.leader ? 1 : 0, u.pin, pinHash, member ? 0 : 1, member ? 1 : 0, member ? 0 : 1)
    created++
  }
  return created
}

/** 팀별 테스트 계정만 (리셋용) */
export const TEST_USERS = DEV_USERS.filter((u) => u.role === 'member')

// 직접 실행된 경우
if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  runMigrations()
  seed()
}
