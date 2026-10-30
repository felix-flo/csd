/**
 * 리더 선정 (진행자 수동 지정. 2026-10-30 결정, docs/100 §7-6 — 팀원 투표를 대체).
 * - 라운드마다 '리더 선출' 단계에서 팀이 오프라인으로 협의해 진행자에게 알리면, 진행자가 관리자 화면에서 팀별로 지정한다.
 * - 활성 팀원이 1명뿐이면 지정 없이 그 사람이 자동 리더 (단계 시작 때, 또는 이주로 1명이 된 때). 0명이면 바로 완료.
 * - 지정 전에 단계를 넘기면 현재 리더를 유지한다 (완료 처리).
 * - 지정은 단계 중 몇 번이든 바꿀 수 있다 (마지막 지정이 유효).
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
}

export interface FinalizeResult {
  status: 'done'
  leaderId: number | null
  /** 리더가 바뀌었는지 (재신임이면 false) */
  changed: boolean
  /** auto: 팀원 1명 자동 · keep: 단계 넘김으로 현 리더 유지 · set: 진행자 지정 */
  how: 'auto' | 'keep' | 'set'
}

function activeMemberIds(teamId: number): number[] {
  return listGroupMembers(teamId).map((m) => m.id)
}

function currentLeaderId(teamId: number): number | null {
  return listGroupMembers(teamId).find((m) => m.isLeader)?.id ?? null
}

/** 해당 일차 행을 팀마다 만든다. 활성 팀원이 없는 팀은 바로 done, 1명뿐인 팀은 그 사람이 자동 리더 */
export function openElections(day: number) {
  const insert = db.prepare('INSERT OR IGNORE INTO leader_elections (day, group_id, status, leader_id) VALUES (?, ?, ?, ?)')
  for (const g of listGroups()) {
    const n = activeMemberIds(g.id).length
    insert.run(day, g.id, n === 0 ? 'done' : 'pending', null)
    if (n === 1) finalizeElection(day, g.id)
  }
}

function getRow(day: number, teamId: number): ElectionRow | undefined {
  return db.prepare('SELECT * FROM leader_elections WHERE day = ? AND group_id = ?').get(day, teamId) as ElectionRow | undefined
}

export function getElection(day: number, teamId: number): ElectionView | null {
  const row = getRow(day, teamId)
  return row ? { status: row.status, leaderId: row.leader_id } : null
}

/** 리더 교체: 팀 내 다른 사람은 리더 해제 */
export function setTeamLeader(teamId: number, userId: number) {
  db.prepare(`UPDATE users SET is_leader = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE role = 'member' AND group_id = ?`).run(userId, teamId)
  ensureLeader(teamId)
}

function markDone(day: number, teamId: number, leaderId: number | null) {
  db.prepare(`UPDATE leader_elections SET status = 'done', leader_id = ? WHERE day = ? AND group_id = ?`).run(leaderId, day, teamId)
}

/**
 * 지정 없이 완료 처리. force=false 면 활성 팀원이 1명뿐일 때만(자동 리더), force=true(단계 전환) 면 현재 리더 유지로 완료.
 * 반환 null = 아직 완료하지 않음 (지정 대기)
 */
export function finalizeElection(day: number, teamId: number, force = false): FinalizeResult | null {
  const row = getRow(day, teamId)
  if (!row || row.status === 'done') return null
  const active = activeMemberIds(teamId)
  if (active.length === 1) {
    const only = active[0]!
    const changed = only !== currentLeaderId(teamId)
    if (changed) setTeamLeader(teamId, only)
    markDone(day, teamId, only)
    return { status: 'done', leaderId: only, changed, how: 'auto' }
  }
  if (!force) return null
  const current = currentLeaderId(teamId)
  markDone(day, teamId, current)
  return { status: 'done', leaderId: current, changed: false, how: 'keep' }
}

/** 진행자 지정. 리더 선출 단계가 아니어도(수동 교체) 쓸 수 있고, 그 일차 행이 있으면 완료로 표시한다 */
export function designateLeader(day: number, teamId: number, userId: number): FinalizeResult {
  return db.transaction(() => {
    if (!activeMemberIds(teamId).includes(userId)) throw new GameError('bad_candidate', '이 팀의 활성 팀원만 리더로 지정할 수 있습니다', 400)
    const changed = userId !== currentLeaderId(teamId)
    if (changed) setTeamLeader(teamId, userId)
    if (getRow(day, teamId)) markDone(day, teamId, userId)
    return { status: 'done' as const, leaderId: userId, changed, how: 'set' as const }
  })()
}

/** 해당 일차 모든 팀 리더 확정 여부 */
export function allElectionsDone(day: number): boolean {
  const rows = db.prepare('SELECT status FROM leader_elections WHERE day = ?').all(day) as { status: string }[]
  return rows.length > 0 && rows.every((r) => r.status === 'done')
}

export function clearElections() {
  db.prepare('DELETE FROM leader_elections').run()
}
