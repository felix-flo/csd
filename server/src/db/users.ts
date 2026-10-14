import { db } from './index.js'
import type { GroupInfo, PublicUser, Role } from '../../../shared/types.js'

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
