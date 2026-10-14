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

function toEvent(r: EventRow): GameEvent {
  return {
    id: r.id,
    type: r.type,
    scope: r.scope,
    targetId: r.target_id,
    targetRole: r.target_role,
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

/** 해당 유저가 볼 수 있는 이벤트 중 afterId 이후 것들 (재접속 replay 용) */
export function listEventsForUser(user: PublicUser, afterId: number, limit = 200): GameEvent[] {
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
