import { db } from './index.js'
import type { EventScope, EventType, GameEvent, PublicUser, Role } from '../../../shared/types.js'

interface EventRow {
  id: number
  type: EventType
  scope: EventScope
  target_id: number | null
  target_role: Role | null
  payload: string
  created_by: number | null
  created_at: string
}

const groupName = db.prepare('SELECT name FROM groups WHERE id = ?')
const userName = db.prepare('SELECT name FROM users WHERE id = ?')

/** group/user scope 대상의 현재 이름 (삭제됐으면 null) */
function targetNameOf(r: EventRow): string | null {
  if (r.target_id == null) return null
  const stmt = r.scope === 'group' ? groupName : r.scope === 'user' ? userName : null
  if (!stmt) return null
  return (stmt.get(r.target_id) as { name: string } | undefined)?.name ?? null
}

function toEvent(r: EventRow): GameEvent {
  return {
    id: r.id,
    type: r.type,
    scope: r.scope,
    targetId: r.target_id,
    targetRole: r.target_role,
    targetName: targetNameOf(r),
    payload: JSON.parse(r.payload),
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export interface NewEvent {
  type: EventType
  scope: EventScope
  targetId?: number | null
  targetRole?: Role | null
  payload?: Record<string, unknown>
  createdBy?: number | null
}

/** 이벤트를 outbox 에 기록하고 저장된 행을 반환 (전송은 realtime 모듈이 담당) */
export function insertEvent(ev: NewEvent): GameEvent {
  const info = db
    .prepare(
      `INSERT INTO events (type, scope, target_id, target_role, payload, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ev.type,
      ev.scope,
      ev.targetId ?? null,
      ev.targetRole ?? null,
      JSON.stringify(ev.payload ?? {}),
      ev.createdBy ?? null,
    )
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid) as EventRow
  return toEvent(row)
}

/** 해당 유저가 볼 수 있는 이벤트 중 afterId 이후 것들 (재접속 replay 용). 진행자(admin)는 전부 본다 */
export function listEventsForUser(user: PublicUser, afterId: number, limit = 200): GameEvent[] {
  if (user.role === 'admin') {
    const rows = db
      .prepare('SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?')
      .all(afterId, limit) as EventRow[]
    return rows.map(toEvent)
  }
  const rows = db
    .prepare(
      `SELECT * FROM events
       WHERE id > ?
         AND (
           scope = 'all'
           OR (scope = 'role'  AND target_role = ?)
           OR (scope = 'group' AND target_id = ?)
           OR (scope = 'user'  AND target_id = ?)
         )
       ORDER BY id ASC LIMIT ?`,
    )
    .all(afterId, user.role, user.groupId ?? -1, user.id, limit) as EventRow[]
  return rows.map(toEvent)
}

/** 해당 유저가 볼 수 있는 최근 이벤트 N건 (피드 초기 표시용). 오래된 것부터 오름차순으로 돌려준다 */
export function listRecentEventsForUser(user: PublicUser, limit = 50): GameEvent[] {
  const where =
    user.role === 'admin'
      ? ''
      : `WHERE scope = 'all'
           OR (scope = 'role'  AND target_role = ?)
           OR (scope = 'group' AND target_id = ?)
           OR (scope = 'user'  AND target_id = ?)`
  const params = user.role === 'admin' ? [limit] : [user.role, user.groupId ?? -1, user.id, limit]
  const rows = db
    .prepare(`SELECT * FROM events ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params) as EventRow[]
  return rows.reverse().map(toEvent)
}

/**
 * 알림 기록 삭제. 기본은 공지(notice)만. 룰 갱신·거래 등 게임 기록은 types 에 명시해야 지워진다.
 * AUTOINCREMENT 라 지워도 id 는 재사용되지 않으므로 클라이언트 replay 가 꼬이지 않는다.
 */
export function deleteEvents(types: EventType[], before?: number | null): number {
  if (types.length === 0) return 0
  const marks = types.map(() => '?').join(', ')
  const params: unknown[] = [...types]
  let sql = `DELETE FROM events WHERE type IN (${marks})`
  if (before != null) {
    sql += ' AND id < ?'
    params.push(before)
  }
  return db.prepare(sql).run(...params).changes
}
