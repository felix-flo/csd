import crypto from 'node:crypto'
import { db } from './index.js'
import { hashPin, normalizePin } from '../auth/tokens.js'
import type { AdminUser, GroupInfo, PublicUser, Role } from '../../../shared/types.js'

interface UserRow {
  id: number
  name: string
  role: Role
  group_id: number | null
  is_leader: number
  active: number
  name_set: number
}

function toPublic(r: UserRow): PublicUser {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    groupId: r.group_id,
    isLeader: r.is_leader === 1,
    nameSet: r.name_set === 1,
  }
}

const selectCols = 'id, name, role, group_id, is_leader, active, name_set'

export function findUserByPinHash(pinHash: string): PublicUser | null {
  const row = db
    .prepare(`SELECT ${selectCols} FROM users WHERE pin_hash = ? AND active = 1`)
    .get(pinHash) as UserRow | undefined
  return row ? toPublic(row) : null
}

export function findUserById(id: number): PublicUser | null {
  const row = db.prepare(`SELECT ${selectCols} FROM users WHERE id = ? AND active = 1`).get(id) as
    | UserRow
    | undefined
  return row ? toPublic(row) : null
}

export function isUserActive(id: number): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE id = ? AND active = 1').get(id)
}

export function findGroupById(id: number): GroupInfo | null {
  const row = db.prepare('SELECT id, code, name, team_color AS color FROM groups WHERE id = ?').get(id) as
    | GroupInfo
    | undefined
  return row ?? null
}

/** 팀 목록. 생성 순서(id) 로 정렬해 기본 4팀(화이트/옐로우/블루/레드)이 앞에 온다 */
export function listGroups(): GroupInfo[] {
  return db.prepare('SELECT id, code, name, team_color AS color FROM groups ORDER BY id').all() as GroupInfo[]
}

export function listGroupMembers(groupId: number): PublicUser[] {
  const rows = db
    .prepare(`SELECT ${selectCols} FROM users WHERE group_id = ? AND active = 1 ORDER BY is_leader DESC, id`)
    .all(groupId) as UserRow[]
  return rows.map(toPublic)
}

// ---- 관리자용 ----

/** 비활성 계정 포함 전체 목록 (PIN 평문 포함: admin 전용 응답에만 사용할 것) */
export function listAllUsers(): AdminUser[] {
  const rows = db
    .prepare(
      `SELECT u.${selectCols.split(', ').join(', u.')}, u.pin, u.is_test, u.is_fixed, u.last_login_at,
              g.code AS group_code, g.name AS group_name, g.team_color AS group_color
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
       ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'presenter' THEN 1 ELSE 2 END, g.id, u.is_leader DESC, u.id`,
    )
    .all() as (UserRow & {
      pin: string | null; is_test: number; is_fixed: number; last_login_at: string | null; group_code: string | null; group_name: string | null; group_color: string | null
    })[]
  return rows.map((r) => ({
    ...toPublic(r),
    active: r.active === 1,
    pin: r.pin,
    groupCode: r.group_code,
    groupName: r.group_name,
    groupColor: r.group_color,
    isTest: r.is_test === 1,
    isFixed: r.is_fixed === 1,
    lastLoginAt: r.last_login_at,
  }))
}

/** 활성/비활성 일괄 변경. 변경된 행 수 반환 */
export function setUsersActive(ids: number[], active: boolean): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  const info = db
    .prepare(`UPDATE users SET active = ? WHERE id IN (${placeholders})`)
    .run(active ? 1 : 0, ...ids)
  return info.changes
}

/** 로그인 성공 시각 기록 (준비 상태의 접속 여부 표시용) */
export function touchLogin(id: number) {
  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(id)
}

export function updateUserName(id: number, name: string): boolean {
  const info = db.prepare('UPDATE users SET name = ?, name_set = 1 WHERE id = ?').run(name, id)
  return info.changes === 1
}

/** 참가자 본인이 첫 로그인 때 이름 설정. 이미 설정했으면 false (이후 변경은 관리자만) */
export function setOwnName(id: number, name: string): boolean {
  const info = db
    .prepare('UPDATE users SET name = ?, name_set = 1 WHERE id = ? AND name_set = 0')
    .run(name, id)
  return info.changes === 1
}

export function setUserPin(id: number, pin: string) {
  const canonical = normalizePin(pin)
  db.prepare('UPDATE users SET pin = ?, pin_hash = ? WHERE id = ?').run(canonical, hashPin(canonical), id)
}

/**
 * 기동 시 1회: 평문 PIN 을 규약(대문자)에 맞게 정규화하고 pin_hash 를 다시 계산한다.
 * - 소문자 시절 만든 계정을 새 규약으로 옮긴다
 * - PIN_SECRET 을 바꿔도 평문이 남아 있으므로 해시를 복구할 수 있다
 */
export function rehashPins(): number {
  const rows = db.prepare('SELECT id, pin, pin_hash FROM users WHERE pin IS NOT NULL').all() as {
    id: number; pin: string; pin_hash: string
  }[]
  const update = db.prepare('UPDATE users SET pin = ?, pin_hash = ? WHERE id = ?')
  let changed = 0
  db.transaction(() => {
    for (const r of rows) {
      const canonical = normalizePin(r.pin)
      const hash = hashPin(canonical)
      if (canonical === r.pin && hash === r.pin_hash) continue
      update.run(canonical, hash, r.id)
      changed++
    }
  })()
  if (changed) console.log(`[db] pin rehashed: ${changed}`)
  return changed
}

export interface NewUser {
  name: string
  role: Role
  pin: string
  groupId?: number | null
  isLeader?: boolean
  nameSet?: boolean
}

export function createUser(u: NewUser): number {
  const info = db
    .prepare(
      `INSERT INTO users (name, role, group_id, is_leader, pin, pin_hash, name_set)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(u.name, u.role, u.groupId ?? null, u.isLeader ? 1 : 0, normalizePin(u.pin), hashPin(u.pin), u.nameSet === false ? 0 : 1)
  return Number(info.lastInsertRowid)
}

export function deleteUsers(ids: number[]): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  return db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...ids).changes
}

/** 기존 PIN 과 겹치지 않는 영문 대문자·숫자 4자리 랜덤 PIN */
export function generatePin(): string {
  const exists = db.prepare('SELECT 1 FROM users WHERE pin_hash = ?')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  for (let attempt = 0; attempt < 1000; attempt++) {
    // 36 은 256 을 나누지 못하므로 편향을 피하려고 범위를 넘는 바이트는 버린다
    const pin = Array.from(crypto.randomBytes(16))
      .filter((b) => b < 252)
      .slice(0, 4)
      .map((b) => alphabet[b % 36])
      .join('')
    if (pin.length !== 4) continue
    if (!exists.get(hashPin(pin))) return pin
  }
  throw new Error('PIN 생성 실패 (중복이 너무 많음)')
}
