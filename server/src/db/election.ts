/**
 * 리더 선출 (팀원 전원 무기명 투표). 일차마다 '리더 선출' 단계에서 팀별로 1회.
 * - 투표 대상·투표자: 그 팀의 활성 참가자. 결과 확정 전까지는 투표를 바꿀 수 있다.
 * - 활성 팀원 전원이 투표하면 바로 집계한다. 최다 득표자가 리더.
 * - 동표: 동표자 중 현재 리더가 있으면 재신임. 없으면 'tie' 로 두고 관리자가 동표자 중에서 지정한다.
 * - 관리자가 투표가 끝나기 전에 다음 단계로 넘기면 그때까지의 표로 집계하고, 표가 없거나 동표가 풀리지 않으면 현재 리더를 유지한다.
 */
import { db } from './index.js'
import { listGroupMembers, listGroups } from './users.js'
import { ensureLeader } from './teams.js'
import { GameError } from './gameError.js'
import type { ElectionStatus, ElectionView } from '../../../shared/game.js'

interface ElectionRow {
  day: number
  group_id: number
  status: ElectionStatus
  leader_id: number | null
  tied: string | null
  tally: string | null
}

export type FinalizeResult =
  | { status: 'done'; leaderId: number | null; votes: number; changed: boolean }
  | { status: 'tie'; tied: number[] }

function activeMemberIds(teamId: number): number[] {
  return listGroupMembers(teamId).map((m) => m.id)
}

function currentLeaderId(teamId: number): number | null {
  return listGroupMembers(teamId).find((m) => m.isLeader)?.id ?? null
}

/** 해당 일차 선거 행을 팀마다 만든다. 활성 팀원이 없는 팀은 바로 done */
export function openElections(day: number) {
  const insert = db.prepare('INSERT OR IGNORE INTO leader_elections (day, group_id, status, leader_id) VALUES (?, ?, ?, ?)')
  for (const g of listGroups()) {
    const empty = activeMemberIds(g.id).length === 0
    insert.run(day, g.id, empty ? 'done' : 'voting', null)
  }
}

function getRow(day: number, teamId: number): ElectionRow | undefined {
  return db.prepare('SELECT * FROM leader_elections WHERE day = ? AND group_id = ?').get(day, teamId) as ElectionRow | undefined
}

export function getElection(day: number, teamId: number, viewerId?: number): ElectionView | null {
  const row = getRow(day, teamId)
  if (!row) return null
  const voted = (db.prepare('SELECT voter_id FROM leader_votes WHERE day = ? AND group_id = ? ORDER BY created_at').all(day, teamId) as {
    voter_id: number
  }[]).map((r) => r.voter_id)
  const myVote = viewerId
    ? ((db.prepare('SELECT candidate_id FROM leader_votes WHERE day = ? AND voter_id = ?').get(day, viewerId) as { candidate_id: number } | undefined)
        ?.candidate_id ?? null)
    : null
  return {
    status: row.status,
    voted,
    voters: activeMemberIds(teamId).length,
    myVote,
    leaderId: row.leader_id,
    tied: row.tied ? (JSON.parse(row.tied) as number[]) : [],
    tally: row.tally ? (JSON.parse(row.tally) as Record<number, number>) : null,
  }
}

/** 리더 교체: 팀 내 다른 사람은 리더 해제 */
export function setTeamLeader(teamId: number, userId: number) {
  db.prepare(`UPDATE users SET is_leader = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE role = 'member' AND group_id = ?`).run(userId, teamId)
  ensureLeader(teamId)
}

function tallyVotes(day: number, teamId: number): Map<number, number> {
  const rows = db
    .prepare('SELECT candidate_id, COUNT(*) AS n FROM leader_votes WHERE day = ? AND group_id = ? GROUP BY candidate_id')
    .all(day, teamId) as { candidate_id: number; n: number }[]
  const active = new Set(activeMemberIds(teamId))
  // 투표 후 탈락·이동한 후보는 제외
  return new Map(rows.filter((r) => active.has(r.candidate_id)).map((r) => [r.candidate_id, r.n]))
}

/**
 * 집계. force=false 면 활성 팀원 전원이 투표했을 때만, force=true(단계 전환) 면 지금까지의 표로.
 * 반환 null = 아직 집계하지 않음
 */
export function finalizeElection(day: number, teamId: number, force = false): FinalizeResult | null {
  const row = getRow(day, teamId)
  if (!row || row.status === 'done') return null
  if (row.status === 'tie' && !force) return null
  const active = activeMemberIds(teamId)
  const votedCount = (db.prepare('SELECT COUNT(*) AS n FROM leader_votes WHERE day = ? AND group_id = ? AND voter_id IN (SELECT id FROM users WHERE active = 1)')
    .get(day, teamId) as { n: number }).n
  if (!force && votedCount < active.length) return null

  const tally = tallyVotes(day, teamId)
  const tallyJson = JSON.stringify(Object.fromEntries(tally))
  const current = currentLeaderId(teamId)
  const done = (leaderId: number | null) => {
    const changed = leaderId != null && leaderId !== current
    if (changed) setTeamLeader(teamId, leaderId)
    const finalLeader = leaderId ?? current
    db.prepare(`UPDATE leader_elections SET status = 'done', leader_id = ?, tied = NULL, tally = ? WHERE day = ? AND group_id = ?`)
      .run(finalLeader, tallyJson, day, teamId)
    return { status: 'done' as const, leaderId: finalLeader, votes: finalLeader != null ? tally.get(finalLeader) ?? 0 : 0, changed }
  }

  if (tally.size === 0) return done(null)
  const max = Math.max(...tally.values())
  const top = [...tally.entries()].filter(([, n]) => n === max).map(([id]) => id)
  if (top.length === 1) return done(top[0]!)
  if (current != null && top.includes(current)) return done(current) // 동표 → 현 리더 재신임
  if (force) return done(null) // 단계가 넘어가면 현재 리더 유지
  db.prepare(`UPDATE leader_elections SET status = 'tie', tied = ?, tally = ? WHERE day = ? AND group_id = ?`)
    .run(JSON.stringify(top), tallyJson, day, teamId)
  return { status: 'tie', tied: top }
}

export function castVote(day: number, teamId: number, voterId: number, candidateId: number): FinalizeResult | null {
  return db.transaction(() => {
    const row = getRow(day, teamId)
    if (!row) throw new GameError('no_election')
    if (row.status !== 'voting') throw new GameError('election_closed', '이미 리더 선출이 끝났습니다')
    if (!activeMemberIds(teamId).includes(candidateId)) throw new GameError('bad_candidate', '팀원만 선택할 수 있습니다', 400)
    // 투표는 1회 확정 (바꿀 수 없음). PK (day, voter_id) 로 중복 클릭·동시 요청에도 한 표만 들어간다
    const inserted = db.prepare(
      `INSERT INTO leader_votes (day, group_id, voter_id, candidate_id) VALUES (?, ?, ?, ?)
       ON CONFLICT (day, voter_id) DO NOTHING`,
    ).run(day, teamId, voterId, candidateId).changes === 1
    if (!inserted) throw new GameError('already_voted', '이미 투표했습니다. 투표는 바꿀 수 없습니다')
    return finalizeElection(day, teamId)
  })()
}

/** 동표 → 관리자가 동표자 중 지정 */
export function resolveTie(day: number, teamId: number, userId: number) {
  return db.transaction(() => {
    const row = getRow(day, teamId)
    if (!row || row.status !== 'tie') throw new GameError('not_tie', '동표 상태가 아닙니다')
    const tied = JSON.parse(row.tied ?? '[]') as number[]
    if (!tied.includes(userId)) throw new GameError('bad_candidate', '동표자 중에서만 지정할 수 있습니다', 400)
    setTeamLeader(teamId, userId)
    db.prepare(`UPDATE leader_elections SET status = 'done', leader_id = ?, tied = NULL WHERE day = ? AND group_id = ?`).run(userId, day, teamId)
  })()
}

/** 해당 일차 모든 팀 리더 확정 여부 */
export function allElectionsDone(day: number): boolean {
  const rows = db.prepare('SELECT status FROM leader_elections WHERE day = ?').all(day) as { status: string }[]
  return rows.length > 0 && rows.every((r) => r.status === 'done')
}

export function clearElections() {
  db.prepare('DELETE FROM leader_votes').run()
  db.prepare('DELETE FROM leader_elections').run()
}
