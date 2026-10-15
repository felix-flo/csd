/**
 * 인원 구성: 관리자가 정한 그룹 수 / 참가자 수 / 진행자 수에 맞춰 그룹·계정을 생성·삭제한다.
 * - 그룹: code 'a','b',... / 이름 'A 그룹'. 줄일 때는 뒤 코드부터 삭제.
 *   그룹 수가 바뀌면 참가자를 모든 그룹에 고르게 재배정한다 (사라진 그룹 소속 → 남은 그룹, 큰 그룹 → 새 그룹).
 *   각 그룹에 리더가 정확히 1명이 되도록 정리한다 (없으면 id 가 가장 작은 참가자).
 * - 진행자(admin): 최소 1명. 줄일 때 가장 먼저 만든 계정(시드 ADMN)과 요청자 본인은 남긴다.
 * - 참가자(member): 새로 만들 때 랜덤 PIN, 이름 '참가자 N', name_set=0 (첫 로그인 때 본인이 입력).
 *   인원이 가장 적은 그룹에 배정. 줄일 때는 id 가 큰(나중에 만든) 계정부터 삭제.
 * - 프레젠테이션(presenter) 계정은 건드리지 않는다.
 */
import { db } from './index.js'
import { createUser, deleteUsers, generatePin, listGroups } from './users.js'

export interface RosterInput {
  groups: number
  participants: number
  staff: number
  /** 요청한 관리자 id (삭제 대상에서 제외) */
  keepAdminId: number
}

export interface RosterResult {
  created: number
  deleted: number
  groupsCreated: number
  groupsDeleted: number
}

const CODES = 'abcdefghijklmnopqrstuvwxyz'

interface MemberRow { id: number; group_id: number | null; is_leader: number }

export function applyRoster(input: RosterInput): RosterResult {
  return db.transaction(() => {
    const result: RosterResult = { created: 0, deleted: 0, groupsCreated: 0, groupsDeleted: 0 }

    // ---- 그룹 ----
    const before = listGroups()
    if (before.length < input.groups) {
      const insert = db.prepare('INSERT INTO groups (code, name) VALUES (?, ?)')
      for (let i = before.length; i < input.groups; i++) {
        insert.run(CODES[i], `${CODES[i]!.toUpperCase()} 그룹`)
        result.groupsCreated++
      }
    } else if (before.length > input.groups) {
      const toDelete = before.slice(input.groups).map((g) => g.id)
      // 소속 참가자는 아래 재배정에서 다른 그룹으로 옮긴다 (FK 는 SET NULL)
      result.groupsDeleted = db
        .prepare(`DELETE FROM groups WHERE id IN (${toDelete.map(() => '?').join(',')})`)
        .run(...toDelete).changes
    }
    const groupsChanged = result.groupsCreated > 0 || result.groupsDeleted > 0

    // ---- 진행자 ----
    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY id`).all() as { id: number }[]
    if (admins.length < input.staff) {
      for (let i = admins.length + 1; i <= input.staff; i++) {
        createUser({ name: `진행자 ${i}`, role: 'admin', pin: generatePin() })
        result.created++
      }
    } else if (admins.length > input.staff) {
      const protectedIds = new Set([admins[0]!.id, input.keepAdminId])
      const removable = admins.filter((a) => !protectedIds.has(a.id)).reverse()
      result.deleted += deleteUsers(removable.slice(0, admins.length - input.staff).map((a) => a.id))
    }

    // ---- 참가자 수 ----
    const groups = listGroups()
    const sizeOf = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'member' AND group_id = ?`)
    const sizes = new Map(groups.map((g) => [g.id, (sizeOf.get(g.id) as { n: number }).n]))
    const smallestGroup = () =>
      [...sizes.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]?.[0] ?? null

    const members = db.prepare(`SELECT id FROM users WHERE role = 'member' ORDER BY id`).all() as { id: number }[]
    if (members.length < input.participants) {
      for (let i = members.length + 1; i <= input.participants; i++) {
        const groupId = smallestGroup()
        if (groupId != null) sizes.set(groupId, sizes.get(groupId)! + 1)
        createUser({ name: `참가자 ${i}`, role: 'member', pin: generatePin(), groupId, nameSet: false })
        result.created++
      }
    } else if (members.length > input.participants) {
      const toDelete = members.slice().reverse().slice(0, members.length - input.participants).map((m) => m.id)
      result.deleted += deleteUsers(toDelete)
    }

    // ---- 재배정 / 리더 정리 ----
    rebalance(groups.map((g) => g.id), groupsChanged)
    return result
  })()
}

/** 그룹이 없는 참가자를 배정하고, 그룹 수가 바뀐 경우 전체를 고르게 나눈 뒤 그룹당 리더 1명을 보장 */
function rebalance(groupIds: number[], even: boolean) {
  if (groupIds.length === 0) return
  const rows = db
    .prepare(`SELECT id, group_id, is_leader FROM users WHERE role = 'member' ORDER BY group_id, id`)
    .all() as MemberRow[]
  const setGroup = db.prepare('UPDATE users SET group_id = ? WHERE id = ?')
  const valid = new Set(groupIds)
  const byGroup = new Map<number, MemberRow[]>(groupIds.map((id) => [id, []]))
  const unassigned: MemberRow[] = []
  for (const m of rows) {
    if (m.group_id != null && valid.has(m.group_id)) byGroup.get(m.group_id)!.push(m)
    else unassigned.push(m)
  }
  if (even) {
    // 목표 인원: 앞 그룹부터 floor(n/g)+1, 나머지는 floor(n/g). 초과분(나중에 들어온 비리더부터)을 재배정 풀로
    const base = Math.floor(rows.length / groupIds.length)
    const extra = rows.length % groupIds.length
    groupIds.forEach((gid, i) => {
      const list = byGroup.get(gid)!
      const target = base + (i < extra ? 1 : 0)
      while (list.length > target) {
        const idx = [...list].reverse().findIndex((m) => m.is_leader === 0)
        const removeAt = idx === -1 ? list.length - 1 : list.length - 1 - idx
        unassigned.push(list.splice(removeAt, 1)[0]!)
      }
    })
  }
  for (const m of unassigned) {
    const target = [...byGroup.entries()].sort((a, b) => a[1].length - b[1].length || a[0] - b[0])[0]![0]
    byGroup.get(target)!.push(m)
    setGroup.run(target, m.id)
  }
  // 리더: 그룹당 정확히 1명 (기존 리더 중 id 가 가장 작은 사람 유지, 없으면 id 최소 참가자)
  const setLeader = db.prepare('UPDATE users SET is_leader = ? WHERE id = ?')
  for (const list of byGroup.values()) {
    if (list.length === 0) continue
    const leaders = list.filter((m) => m.is_leader === 1).sort((a, b) => a.id - b.id)
    const keep = leaders[0] ?? list.slice().sort((a, b) => a.id - b.id)[0]!
    for (const m of list) {
      const want = m.id === keep.id ? 1 : 0
      if (m.is_leader !== want) setLeader.run(want, m.id)
    }
  }
}
