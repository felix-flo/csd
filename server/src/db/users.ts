import { db } from './index.js'
import type { AdminUser, GroupInfo, PublicUser, Role } from '../../../shared/types.js'

interface UserRow {
  id: number
  name: string
  role: Role
  group_id: number | null
  is_leader: number
  active: number
}

function toPublic(r: UserRow): PublicUser {
  return { id: r.id, name: r.name, role: r.role, groupId: r.group_id, isLeader: r.is_leader === 1 }
}

const selectCols = 'id, name, role, group_id, is_leader, active'

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

export function findGroupById(id: number): GroupInfo | null {
  const row = db.prepare('SELECT id, code, name FROM groups WHERE id = ?').get(id) as
    | GroupInfo
    | undefined
  return row ?? null
}

export function listGroupMembers(groupId: number): PublicUser[] {
  const rows = db
    .prepare(`SELECT ${selectCols} FROM users WHERE group_id = ? AND active = 1 ORDER BY is_leader DESC, id`)
    .all(groupId) as UserRow[]
  return rows.map(toPublic)
}

export function isUserActive(id: number): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE id = ? AND active = 1').get(id)
}

/** 관리자용: 비활성 계정 포함 전체 목록 */
export function listAllUsers(): AdminUser[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.role, u.group_id, u.is_leader, u.active, g.code AS group_code, g.name AS group_name
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
       ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'presenter' THEN 1 ELSE 2 END, g.code, u.is_leader DESC, u.id`,
    )
    .all() as (UserRow & { group_code: string | null; group_name: string | null })[]
  return rows.map((r) => ({
    ...toPublic(r),
    active: r.active === 1,
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
