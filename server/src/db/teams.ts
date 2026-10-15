/**
 * 팀(groups 테이블) 관리.
 * - 기본 4팀은 기동 시 없으면 만든다. 0004 마이그레이션 이전의 a~d 그룹은 SQL 에서 기본 4팀으로 매핑되고,
 *   그 밖의 옛 그룹(e, f, …)은 ensureTeams() 가 소속 참가자를 인원 적은 팀으로 옮긴 뒤 삭제한다.
 * - 팀 추가/이름·색 수정은 자유. 삭제는 소속 참가자(활성·비활성 포함)가 0명일 때만.
 * - 팀당 리더 1명: 활성 참가자 중 기존 리더(id 최소) 유지, 없으면 활성 참가자 중 id 최소. 나머지는 리더 해제.
 */
import { db } from './index.js'
import { listGroups } from './users.js'
import { DEFAULT_TEAMS } from '../../../shared/teams.js'
import type { GroupInfo } from '../../../shared/types.js'

const TEAM_CODE = /^(white|yellow|blue|red|t\d+)$/

export function ensureTeams(): { created: number; legacyRemoved: number } {
  return db.transaction(() => {
    let created = 0
    let legacyRemoved = 0
    if (listGroups().length === 0) {
      const insert = db.prepare('INSERT INTO groups (code, name, team_color) VALUES (?, ?, ?)')
      for (const t of DEFAULT_TEAMS) {
        insert.run(t.code, t.name, t.color)
        created++
      }
    }
    const legacy = listGroups().filter((g) => !TEAM_CODE.test(g.code))
    if (legacy.length > 0) {
      const keep = listGroups().filter((g) => TEAM_CODE.test(g.code))
      if (keep.length === 0) return { created, legacyRemoved } // 옮길 곳이 없으면 그대로 둔다
      const members = db.prepare('SELECT id FROM users WHERE group_id = ? ORDER BY id')
      for (const g of legacy) {
        for (const m of members.all(g.id) as { id: number }[]) {
          db.prepare('UPDATE users SET group_id = ?, is_leader = 0 WHERE id = ?').run(smallestTeam(keep.map((k) => k.id)), m.id)
        }
        db.prepare('DELETE FROM groups WHERE id = ?').run(g.id)
        legacyRemoved++
      }
      for (const k of keep) ensureLeader(k.id)
    }
    if (created || legacyRemoved) console.log(`[teams] default created: ${created}, legacy removed: ${legacyRemoved}`)
    return { created, legacyRemoved }
  })()
}

/** 참가자(활성·비활성 포함)가 가장 적은 팀 id. 같으면 id 가 작은 팀 */
export function smallestTeam(teamIds: number[]): number {
  const count = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'member' AND group_id = ?`)
  return teamIds
    .map((id) => ({ id, n: (count.get(id) as { n: number }).n }))
    .sort((a, b) => a.n - b.n || a.id - b.id)[0]!.id
}

export function countTeamMembers(teamId: number): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'member' AND group_id = ?`).get(teamId) as { n: number }).n
}

export function createTeam(input: { name: string; color: string }): GroupInfo {
  return db.transaction(() => {
    // code 는 't<id>'. id 를 알아야 하므로 임시 코드로 넣고 바로 바꾼다
    const info = db
      .prepare('INSERT INTO groups (code, name, team_color) VALUES (?, ?, ?)')
      .run(`tmp-${Date.now()}-${Math.random()}`, input.name, input.color)
    const id = Number(info.lastInsertRowid)
    db.prepare(`UPDATE groups SET code = 't' || id WHERE id = ?`).run(id)
    return { id, code: `t${id}`, name: input.name, color: input.color }
  })()
}

export function updateTeam(id: number, patch: { name?: string; color?: string }): boolean {
  const sets: string[] = []
  const params: unknown[] = []
  if (patch.name !== undefined) { sets.push('name = ?'); params.push(patch.name) }
  if (patch.color !== undefined) { sets.push('team_color = ?'); params.push(patch.color) }
  if (sets.length === 0) return true
  params.push(id)
  return db.prepare(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`).run(...params).changes === 1
}

/** 소속 참가자가 0명일 때만 삭제. 결과: 'ok' | 'not_found' | 'not_empty' */
export function deleteTeam(id: number): 'ok' | 'not_found' | 'not_empty' {
  return db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM groups WHERE id = ?').get(id)) return 'not_found' as const
    if (countTeamMembers(id) > 0) return 'not_empty' as const
    db.prepare('DELETE FROM groups WHERE id = ?').run(id)
    return 'ok' as const
  })()
}

export function teamNameExists(name: string, exceptId?: number): boolean {
  return !!db.prepare('SELECT 1 FROM groups WHERE name = ? AND id != ?').get(name, exceptId ?? -1)
}

/**
 * 팀당 리더 1명 보장. 활성 참가자만 리더가 될 수 있다.
 * 반환: 새로 리더가 된 유저 id (변경 없으면 null)
 */
export function ensureLeader(teamId: number): number | null {
  const rows = db
    .prepare(`SELECT id, is_leader, active FROM users WHERE role = 'member' AND group_id = ? ORDER BY id`)
    .all(teamId) as { id: number; is_leader: number; active: number }[]
  const active = rows.filter((r) => r.active === 1)
  const keep = active.find((r) => r.is_leader === 1) ?? active[0]
  const setLeader = db.prepare('UPDATE users SET is_leader = ? WHERE id = ?')
  let promoted: number | null = null
  for (const r of rows) {
    const want = keep && r.id === keep.id ? 1 : 0
    if (r.is_leader !== want) {
      setLeader.run(want, r.id)
      if (want === 1) promoted = r.id
    }
  }
  return promoted
}

/**
 * 참가자 팀 이동. 이동한 사람은 리더를 내려놓고(대상 팀에 리더가 없으면 승계), 이전 팀은 리더를 다시 정한다.
 * 결과에 이전/새 팀 정보를 담아 호출자가 알림을 보내게 한다.
 */
export function moveMember(userId: number, toTeamId: number): { from: GroupInfo | null; to: GroupInfo } | 'not_found' | 'same_team' {
  return db.transaction(() => {
    const u = db.prepare(`SELECT id, group_id FROM users WHERE id = ? AND role = 'member'`).get(userId) as
      | { id: number; group_id: number | null }
      | undefined
    const to = db.prepare('SELECT id, code, name, team_color AS color FROM groups WHERE id = ?').get(toTeamId) as GroupInfo | undefined
    if (!u || !to) return 'not_found' as const
    if (u.group_id === to.id) return 'same_team' as const
    const from = u.group_id
      ? (db.prepare('SELECT id, code, name, team_color AS color FROM groups WHERE id = ?').get(u.group_id) as GroupInfo | undefined) ?? null
      : null
    db.prepare('UPDATE users SET group_id = ?, is_leader = 0 WHERE id = ?').run(to.id, userId)
    if (from) ensureLeader(from.id)
    ensureLeader(to.id)
    return { from, to }
  })()
}
