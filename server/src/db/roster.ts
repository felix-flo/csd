/**
 * 인원 구성: 팀별 목표 인원 / 진행자 수에 맞춰 계정을 **추가만** 한다.
 * - 참가자 삭제는 없다 (요구사항). 현재 인원보다 작은 값은 거부한다 → 빼려면 탈락 처리(비활성화)나 팀 이동.
 * - 참가자(member): 랜덤 PIN, 이름 '참가자 N', name_set=0 (첫 로그인 때 본인이 입력). 지정한 팀에 배정.
 * - 진행자(admin): 추가만. 줄이는 것도 거부한다.
 * - 팀이 없는 참가자(옛 데이터)는 인원이 가장 적은 팀에 배정한다.
 * - 팀당 리더 1명 보장 (teams.ensureLeader).
 * - 프레젠테이션(presenter) 계정은 건드리지 않는다.
 */
import { db } from './index.js'
import { createUser, generatePin, listGroups } from './users.js'
import { countTeamMembers, ensureLeader, smallestTeam } from './teams.js'

export interface RosterInput {
  /** teamId → 목표 인원 (활성·비활성 포함). 빠진 팀은 변경 없음 */
  teams: Record<string, number>
  staff: number
}

export interface RosterResult {
  created: number
}

export class RosterError extends Error {
  constructor(public code: 'unknown_team' | 'cannot_shrink', public detail: string) {
    super(`${code}: ${detail}`)
  }
}

export function applyRoster(input: RosterInput): RosterResult {
  return db.transaction(() => {
    const result: RosterResult = { created: 0 }
    const teams = listGroups()
    const byId = new Map(teams.map((t) => [t.id, t]))

    // ---- 검증 먼저 (하나라도 거부되면 아무것도 바꾸지 않는다) ----
    const plan: { teamId: number; add: number }[] = []
    for (const [key, target] of Object.entries(input.teams)) {
      const team = byId.get(Number(key))
      if (!team) throw new RosterError('unknown_team', key)
      const current = countTeamMembers(team.id)
      if (target < current) throw new RosterError('cannot_shrink', `${team.name} 현재 ${current}명`)
      if (target > current) plan.push({ teamId: team.id, add: target - current })
    }
    const admins = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get() as { n: number }).n
    if (input.staff < admins) throw new RosterError('cannot_shrink', `진행자 현재 ${admins}명`)

    // ---- 팀 없는 참가자 정리 ----
    if (teams.length > 0) {
      const orphans = db.prepare(`SELECT id FROM users WHERE role = 'member' AND group_id IS NULL ORDER BY id`).all() as { id: number }[]
      for (const o of orphans) {
        db.prepare('UPDATE users SET group_id = ? WHERE id = ?').run(smallestTeam(teams.map((t) => t.id)), o.id)
      }
    }

    // ---- 참가자 추가 ----
    let seq = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'member'`).get() as { n: number }).n
    for (const p of plan) {
      for (let i = 0; i < p.add; i++) {
        seq++
        createUser({ name: `참가자 ${seq}`, role: 'member', pin: generatePin(), groupId: p.teamId, nameSet: false })
        result.created++
      }
    }

    // ---- 진행자 추가 ----
    for (let i = admins + 1; i <= input.staff; i++) {
      createUser({ name: `진행자 ${i}`, role: 'admin', pin: generatePin() })
      result.created++
    }

    for (const t of teams) ensureLeader(t.id)
    return result
  })()
}
