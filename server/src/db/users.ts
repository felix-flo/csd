import crypto from 'node:crypto'
import { db } from './index.js'
import { hashPin } from '../auth/tokens.js'
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
  const row = db.prepare('SELECT id, code, name FROM groups WHERE id = ?').get(id) as
    | GroupInfo
    | undefined
  return row ?? null
}

export function listGroups(): GroupInfo[] {
  return db.prepare('SELECT id, code, name FROM groups ORDER BY code').all() as GroupInfo[]
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
      `SELECT u.${selectCols.split(', ').join(', u.')}, u.pin, g.code AS group_code, g.name AS group_name
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
       ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'presenter' THEN 1 ELSE 2 END, g.code, u.is_leader DESC, u.id`,
    )
    .all() as (UserRow & { pin: string | null; group_code: string | null; group_name: string | null })[]
  return rows.map((r) => ({
    ...toPublic(r),
    active: r.active === 1,
    pin: r.pin,
    groupCode: r.group_code,
    groupName: r.group_name,
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
  db.prepare('UPDATE users SET pin = ?, pin_hash = ? WHERE id = ?').run(pin, hashPin(pin), id)
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
    .run(u.name, u.role, u.groupId ?? null, u.isLeader ? 1 : 0, u.pin, hashPin(u.pin), u.nameSet === false ? 0 : 1)
  return Number(info.lastInsertRowid)
}

export function deleteUsers(ids: number[]): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  return db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...ids).changes
}

/** 기존 PIN 과 겹치지 않는 영문 소문자 4자리 랜덤 PIN */
export function generatePin(): string {
  const exists = db.prepare('SELECT 1 FROM users WHERE pin_hash = ?')
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  for (let attempt = 0; attempt < 1000; attempt++) {
    const bytes = crypto.randomBytes(4)
    const pin = Array.from(bytes, (b) => letters[b % 26]).join('')
    if (!exists.get(hashPin(pin))) return pin
  }
  throw new Error('PIN 생성 실패 (중복이 너무 많음)')
}
