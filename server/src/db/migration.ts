/**
 * 이주 (docs/100.최종룰_차이_결정사항.md N3, 룰 03 §10).
 *   일반 팀원 신청(pending) ──받는 팀 리더 수락──▶ accepted (즉시 소속 변경, 빈손)
 *                          ├─받는 팀 리더 거절──▶ rejected
 *                          └─본인·관리자 취소 / 신청자가 리더가 됨·탈락·팀이 바뀜 ──▶ cancelled
 *
 * 규칙:
 * - 진행 중 · 이주 시작 라운드(game.migration_start_day)부터 · 라이프 제출 단계 제외. 최종장 없음
 * - 리더는 신청할 수 없다 (수락 때도 다시 확인). 1인 대기 1건 (idx_migrations_one_pending), 횟수 제한 없음
 * - 받는 팀 인원 제한 없음
 * - 대기 신청이 있으면 리더 협의 → 라이프 제출로 넘어가지 못한다 (game.ts advance). 관리자가 강제 취소로 풀 수 있다
 * - 리더 선출 단계에 수락되면: 원래 팀 선거가 투표 중이면 이주자가 낸 표와 이주자를 찍은 표를 지운다 (이주자는 새 팀에서 투표).
 *   이미 끝난 선거는 그대로
 *
 * 동시성: 상태 변경은 `UPDATE … WHERE status = 'pending'` 의 changes 로 판정 → 수락·취소가 겹쳐도 한 번만 반영된다.
 */
import { db } from './index.js'
import { listGroups } from './users.js'
import { moveMember } from './teams.js'
import { GameError } from './gameError.js'
import { isMigrationOpen } from '../../../shared/game.js'
import type { GameStatus, MigrationCancelReason, MigrationStatus, MigrationView, Phase, TeamMigrationView } from '../../../shared/game.js'

/** game.ts 가 이 모듈을 불러 쓰므로 순환 import 를 피해 필요한 열만 직접 읽는다 */
function getGameRow() {
  return db.prepare('SELECT status, day, phase, migration_start_day FROM game WHERE id = 1').get() as {
    status: GameStatus; day: number; phase: Phase | null; migration_start_day: number
  }
}

export function migrationOpenNow(): boolean {
  const g = getGameRow()
  return isMigrationOpen(g.status, g.day, g.phase, g.migration_start_day)
}

function requireOpen() {
  const g = getGameRow()
  if (g.status !== 'running') throw new GameError('not_running', '게임이 진행 중이 아닙니다')
  if (g.day < g.migration_start_day) throw new GameError('migration_closed', `이주는 ${g.migration_start_day}라운드부터 할 수 있습니다`)
  if (g.phase === 'life') throw new GameError('migration_closed', '라이프 제출 단계에는 이주할 수 없습니다')
  return g
}

interface MigrationRow {
  id: number
  day: number
  user_id: number
  user_name: string
  from_group: number
  to_group: number
  status: MigrationStatus
  cancel_reason: MigrationCancelReason | null
  created_at: string
  decided_at: string | null
}

const SELECT = `SELECT m.id, m.day, m.user_id, u.name AS user_name, m.from_group, m.to_group, m.status, m.cancel_reason, m.created_at, m.decided_at
                FROM migrations m JOIN users u ON u.id = m.user_id`

function toView(r: MigrationRow): MigrationView {
  return {
    id: r.id,
    day: r.day,
    userId: r.user_id,
    userName: r.user_name,
    fromTeamId: r.from_group,
    toTeamId: r.to_group,
    status: r.status,
    cancelReason: r.cancel_reason,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }
}

export function getMigration(id: number): MigrationView | null {
  const r = db.prepare(`${SELECT} WHERE m.id = ?`).get(id) as MigrationRow | undefined
  return r ? toView(r) : null
}

export function pendingMigrations(): MigrationView[] {
  return (db.prepare(`${SELECT} WHERE m.status = 'pending' ORDER BY m.id`).all() as MigrationRow[]).map(toView)
}

/** 신청. 활성 일반 팀원(리더 아님)만, 다른 팀으로 */
export function requestMigration(userId: number, toTeamId: number): MigrationView {
  return db.transaction(() => {
    const g = requireOpen()
    const u = db.prepare(`SELECT group_id, is_leader FROM users WHERE id = ? AND role = 'member' AND active = 1`).get(userId) as
      | { group_id: number | null; is_leader: number }
      | undefined
    if (!u?.group_id) throw new GameError('no_group', '', 404)
    if (u.is_leader === 1) throw new GameError('leader', '리더는 이주를 신청할 수 없습니다', 403)
    if (!listGroups().some((t) => t.id === toTeamId)) throw new GameError('not_found', '', 404)
    if (toTeamId === u.group_id) throw new GameError('same_team', '지금 팀으로는 이주할 수 없습니다', 400)
    const r = db.prepare(`INSERT OR IGNORE INTO migrations (day, user_id, from_group, to_group) VALUES (?, ?, ?, ?)`).run(g.day, userId, u.group_id, toTeamId)
    if (r.changes !== 1) throw new GameError('migration_pending', '이미 대기 중인 이주 신청이 있습니다. 취소한 뒤 다시 신청하세요')
    return getMigration(Number(r.lastInsertRowid))!
  })()
}

/** 취소 (본인·관리자·자동). by 는 본인 취소일 때 신청자 확인용 */
export function cancelMigration(id: number, reason: MigrationCancelReason, by: number | null): MigrationView {
  return db.transaction(() => {
    const m = getMigration(id)
    if (!m) throw new GameError('not_found', '', 404)
    if (reason === 'self' && m.userId !== by) throw new GameError('not_yours', '본인 신청만 취소할 수 있습니다', 403)
    const ok = db.prepare(`UPDATE migrations SET status = 'cancelled', cancel_reason = ?, decided_at = datetime('now'), decided_by = ? WHERE id = ? AND status = 'pending'`)
      .run(reason, by, id).changes === 1
    if (!ok) throw new GameError('already_decided', '이미 처리된 신청입니다')
    return getMigration(id)!
  })()
}

export interface MigrationDecision {
  migration: MigrationView
  /** 수락: 리더 선출 단계에 원래 팀 표를 정리했으면 그 팀 (호출자가 재집계) */
  electionTeam: number | null
}

/** 받는 팀 리더의 수락/거절 */
export function decideMigration(id: number, leaderId: number, accept: boolean): MigrationDecision {
  return db.transaction(() => {
    const g = requireOpen()
    const m = getMigration(id)
    if (!m) throw new GameError('not_found', '', 404)
    const leader = db.prepare(`SELECT group_id, is_leader FROM users WHERE id = ? AND active = 1`).get(leaderId) as { group_id: number | null; is_leader: number } | undefined
    if (!leader || leader.is_leader !== 1 || leader.group_id !== m.toTeamId) throw new GameError('not_leader', '받는 팀 리더만 처리할 수 있습니다', 403)
    if (m.status !== 'pending') throw new GameError('already_decided', '이미 처리된 신청입니다')
    if (!accept) {
      db.prepare(`UPDATE migrations SET status = 'rejected', decided_at = datetime('now'), decided_by = ? WHERE id = ? AND status = 'pending'`).run(leaderId, id)
      return { migration: getMigration(id)!, electionTeam: null }
    }
    const u = db.prepare(`SELECT group_id, is_leader, active FROM users WHERE id = ?`).get(m.userId) as { group_id: number | null; is_leader: number; active: number }
    // 자동 취소 대상은 라우터가 결정 전에 sweepMigrations() 로 정리한다. 여기는 안전장치 (throw 하면 트랜잭션이 롤백되므로 상태는 바꾸지 않는다)
    if (u.active !== 1 || u.is_leader === 1 || u.group_id !== m.fromTeamId) {
      throw new GameError('migration_stale', '신청자가 리더가 되었거나 탈락·팀 이동되어 수락할 수 없습니다')
    }
    db.prepare(`UPDATE migrations SET status = 'accepted', decided_at = datetime('now'), decided_by = ? WHERE id = ? AND status = 'pending'`).run(leaderId, id)
    const moved = moveMember(m.userId, m.toTeamId)
    if (typeof moved === 'string') throw new GameError('not_found', '', 404)
    let electionTeam: number | null = null
    if (g.phase === 'leader') {
      const row = db.prepare('SELECT status FROM leader_elections WHERE day = ? AND group_id = ?').get(g.day, m.fromTeamId) as { status: string } | undefined
      if (row?.status === 'voting') {
        // 원래 팀 표 무효: 이주자가 낸 표 + 이주자를 찍은 표. 이주자는 새 팀에서 다시 투표할 수 있다
        db.prepare('DELETE FROM leader_votes WHERE day = ? AND group_id = ? AND (voter_id = ? OR candidate_id = ?)').run(g.day, m.fromTeamId, m.userId, m.userId)
        electionTeam = m.fromTeamId
      }
    }
    return { migration: getMigration(id)!, electionTeam }
  })()
}

/**
 * 자동 취소: 신청자가 리더가 됐거나, 탈락했거나, 다른 경로(관리자 팀 이동)로 팀이 바뀐 대기 신청.
 * 리더가 바뀌는 지점·탈락 처리·팀 이동 뒤에 호출한다. 반환: 취소된 신청 (호출자가 알림)
 */
export function sweepMigrations(): MigrationView[] {
  return db.transaction(() => {
    const rows = db.prepare(
      `SELECT m.id, CASE WHEN u.active != 1 THEN 'inactive' WHEN u.is_leader = 1 THEN 'leader' ELSE 'moved' END AS reason
       FROM migrations m JOIN users u ON u.id = m.user_id
       WHERE m.status = 'pending' AND (u.active != 1 OR u.is_leader = 1 OR u.group_id IS NOT m.from_group OR u.group_id = m.to_group)`,
    ).all() as { id: number; reason: MigrationCancelReason }[]
    const upd = db.prepare(`UPDATE migrations SET status = 'cancelled', cancel_reason = ?, decided_at = datetime('now') WHERE id = ? AND status = 'pending'`)
    return rows.filter((r) => upd.run(r.reason, r.id).changes === 1).map((r) => getMigration(r.id)!)
  })()
}

/** 게임 종료(최종장) 때 남은 대기 신청 정리 — 라이프 단계에서 막으므로 보통 없다 */
export function cancelAllPendingMigrations(): MigrationView[] {
  const ids = pendingMigrations().map((m) => m.id)
  db.prepare(`UPDATE migrations SET status = 'cancelled', cancel_reason = 'admin', decided_at = datetime('now') WHERE status = 'pending'`).run()
  return ids.map((id) => getMigration(id)!)
}

/** 참가자 화면용 */
export function getTeamMigrationView(userId: number, teamId: number, isLeader: boolean): TeamMigrationView {
  const g = getGameRow()
  const mine = db.prepare(`${SELECT} WHERE m.user_id = ? AND m.status = 'pending'`).get(userId) as MigrationRow | undefined
  const incoming = isLeader ? (db.prepare(`${SELECT} WHERE m.to_group = ? AND m.status = 'pending' ORDER BY m.id`).all(teamId) as MigrationRow[]).map(toView) : []
  return {
    open: isMigrationOpen(g.status, g.day, g.phase, g.migration_start_day),
    startDay: g.migration_start_day,
    mine: mine ? toView(mine) : null,
    incoming,
  }
}

/** 관리자 화면용 */
export function getAdminMigrations(): { pending: MigrationView[]; recent: MigrationView[] } {
  return {
    pending: pendingMigrations(),
    recent: (db.prepare(`${SELECT} WHERE m.status != 'pending' ORDER BY m.id DESC LIMIT 20`).all() as MigrationRow[]).map(toView),
  }
}

/** 현재 받는 팀 리더 id (신청·취소 알림 대상) */
export function teamLeaderId(teamId: number): number | null {
  return (db.prepare(`SELECT id FROM users WHERE role = 'member' AND group_id = ? AND is_leader = 1 AND active = 1`).get(teamId) as { id: number } | undefined)?.id ?? null
}

export function clearMigrations() {
  db.prepare('DELETE FROM migrations').run()
}
