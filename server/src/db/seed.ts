/**
 * 개발용 시드 데이터.
 * - 고정 PIN 으로 관리자 / 프레젠테이션 / 그룹별 리더·테스트유저 로그인 가능
 * - 이미 존재하는 pin_hash 는 건너뛴다 (멱등). 실제 운영 전에는 PIN 전체 교체 필요.
 * 단독 실행: npm run seed  (서버 기동 시 SEED_ON_START=true 면 자동 실행)
 */
import { db, runMigrations } from './index.js'
import { hashPin } from '../auth/tokens.js'

export interface SeedUser {
  name: string
  role: 'admin' | 'presenter' | 'member'
  pin: string
  group?: string
  leader?: boolean
}

export const DEV_GROUPS = [
  { code: 'a', name: 'A 그룹' },
  { code: 'b', name: 'B 그룹' },
  { code: 'c', name: 'C 그룹' },
  { code: 'd', name: 'D 그룹' },
]

export const DEV_USERS: SeedUser[] = [
  { name: '관리자', role: 'admin', pin: 'admn' },
  { name: '프레젠테이션', role: 'presenter', pin: 'show' },
  ...DEV_GROUPS.flatMap(({ code, name }) => [
    { name: `${name} 리더`, role: 'member' as const, pin: `${code}ldr`, group: code, leader: true },
    { name: `${name} 테스트유저`, role: 'member' as const, pin: `${code}mem`, group: code },
  ]),
]

export function seed() {
  const upsertGroup = db.prepare('INSERT OR IGNORE INTO groups (code, name) VALUES (?, ?)')
  const findGroup = db.prepare('SELECT id FROM groups WHERE code = ?')
  const userExists = db.prepare('SELECT 1 FROM users WHERE pin_hash = ?')
  const insertUser = db.prepare(
    'INSERT INTO users (name, role, group_id, is_leader, pin, pin_hash, name_set) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  // 0002 마이그레이션 이전에 만들어진 시드 행: 평문 PIN 백필 (1회)
  const backfill = db.prepare('UPDATE users SET pin = ?, name_set = ? WHERE pin_hash = ? AND pin IS NULL')

  let created = 0
  db.transaction(() => {
    for (const g of DEV_GROUPS) upsertGroup.run(g.code, g.name)
    for (const u of DEV_USERS) {
      const pinHash = hashPin(u.pin)
      // 시드 참가자는 name_set=0 으로 두어 첫 로그인 이름 입력 흐름을 테스트할 수 있게 한다
      const nameSet = u.role === 'member' ? 0 : 1
      if (userExists.get(pinHash)) {
        backfill.run(u.pin, nameSet, pinHash)
        continue
      }
      const groupId = u.group ? (findGroup.get(u.group) as { id: number }).id : null
      insertUser.run(u.name, u.role, groupId, u.leader ? 1 : 0, u.pin, pinHash, nameSet)
      created++
    }
  })()
  console.log(`[seed] users created: ${created} (groups: ${DEV_GROUPS.length})`)
}

// 직접 실행된 경우
if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  runMigrations()
  seed()
}
