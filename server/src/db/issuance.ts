/**
 * 보석·골드 발행 요청 (docs/97.보석골드_발행.md). 화이트팀(code=white)은 보석, 옐로우팀(code=yellow)은 골드.
 *   리더 요청(pending) ──관리자 수락──▶ approved (팀 재화 증가)
 *                     ├─관리자 거절──▶ rejected (한도 돌려줌)
 *                     └─게임 종료────▶ cancelled
 *
 * 한도 (일차 = 턴): 대기 중·수락된 수량이 요청한 일차의 한도를 차지한다.
 * - 보석: 매 일차 gem_issue_limit 까지 (이월 없음)
 * - 골드: 매 일차 gold_issue_limit 씩 쌓임 → n일차 한도 = limit × n − 지금까지 사용량
 *
 * 동시성:
 * - 팀당 대기 요청 1건은 idx_issue_one_pending (partial unique index) 이 보장한다. 리더가 두 번 눌러도 하나만 들어간다.
 * - 한도 확인과 INSERT 를 한 트랜잭션에서 하므로 한도를 넘는 요청이 끼어들 수 없다.
 * - 수락·거절은 `UPDATE … WHERE id = ? AND status = 'pending'` 의 changes 로 판정 → 관리자 두 명이 동시에 눌러도 한 번만 반영된다.
 */
import { db } from './index.js'
import { findGroupById, listGroups } from './users.js'
import { applyDeltas } from './resources.js'
import { GameError } from './gameError.js'
import { ISSUE_PHASES, ISSUE_TEAM_CODE, issueKindOfTeam, issueRemaining, RESOURCE_LABELS } from '../../../shared/game.js'
import type { IssueKind, IssueRequestView, IssueStatus, Phase, TeamIssueView } from '../../../shared/game.js'

/** game.ts 가 이 모듈을 불러 쓰므로(종료·리셋) 순환 import 를 피해 필요한 열만 직접 읽는다 */
function getGameRow() {
  return db.prepare('SELECT status, day, phase, gem_issue_limit, gold_issue_limit FROM game WHERE id = 1').get() as {
    status: string; day: number; phase: Phase | null; gem_issue_limit: number; gold_issue_limit: number
  }
}

interface IssueRow {
  id: number
  day: number
  group_id: number
  kind: IssueKind
  amount: number
  status: IssueStatus
  requested_by: number | null
  requested_by_name: string | null
  created_at: string
  decided_at: string | null
}

const SELECT = `SELECT r.id, r.day, r.group_id, r.kind, r.amount, r.status, r.requested_by, u.name AS requested_by_name, r.created_at, r.decided_at
                FROM issue_requests r LEFT JOIN users u ON u.id = r.requested_by`

function toView(r: IssueRow): IssueRequestView {
  return {
    id: r.id,
    day: r.day,
    teamId: r.group_id,
    kind: r.kind,
    amount: r.amount,
    status: r.status,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }
}

export function getIssue(id: number): IssueRequestView | null {
  const r = db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as IssueRow | undefined
  return r ? toView(r) : null
}

export function getLimit(kind: IssueKind): number {
  const g = getGameRow()
  return kind === 'gem' ? g.gem_issue_limit : g.gold_issue_limit
}

/** 남은 발행 가능량 (현재 일차 기준. 대기 중 요청도 뺀다) */
export function remainingFor(teamId: number, kind: IssueKind): number {
  const day = getGameRow().day
  const used = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN day = ? THEN amount END), 0) AS today, COALESCE(SUM(amount), 0) AS total
       FROM issue_requests WHERE group_id = ? AND kind = ? AND status IN ('pending', 'approved')`,
    )
    .get(day, teamId, kind) as { today: number; total: number }
  return issueRemaining(kind, getLimit(kind), day, used)
}

function teamKind(teamId: number): IssueKind | null {
  return issueKindOfTeam(findGroupById(teamId)?.code)
}

/** 발행 팀의 id (팀이 지워졌으면 null) */
export function issueTeamId(kind: IssueKind): number | null {
  return listGroups().find((t) => t.code === ISSUE_TEAM_CODE[kind])?.id ?? null
}

function listFor(where: string, params: unknown[], limit: number): IssueRequestView[] {
  return (db.prepare(`${SELECT} WHERE ${where} ORDER BY r.id DESC LIMIT ?`).all(...params, limit) as IssueRow[]).map(toView)
}

/** 화이트·옐로우팀 화면용. 다른 팀이면 null */
export function getTeamIssue(teamId: number): TeamIssueView | null {
  const kind = teamKind(teamId)
  if (!kind) return null
  const g = getGameRow()
  const recent = listFor('r.group_id = ?', [teamId], 10)
  return {
    kind,
    phaseOpen: g.status === 'running' && !!g.phase && ISSUE_PHASES.includes(g.phase),
    remaining: g.status === 'running' ? remainingFor(teamId, kind) : 0,
    pending: recent.find((r) => r.status === 'pending') ?? null,
    recent,
  }
}

/** 관리자 화면용 */
export function getAdminIssues() {
  const running = getGameRow().status === 'running'
  const remaining = (kind: IssueKind) => {
    const teamId = issueTeamId(kind)
    return teamId != null && running ? remainingFor(teamId, kind) : null
  }
  return {
    pending: (db.prepare(`${SELECT} WHERE r.status = 'pending' ORDER BY r.id`).all() as IssueRow[]).map(toView),
    recent: listFor('1 = 1', [], 20),
    remaining: { gem: remaining('gem'), gold: remaining('gold') },
  }
}

/** 리더의 발행 요청. 리더 여부는 라우터가 확인한다 */
export function requestIssue(teamId: number, amount: number, by: number): IssueRequestView {
  return db.transaction(() => {
    const g = getGameRow()
    if (g.status !== 'running') throw new GameError('not_running', '게임이 진행 중이 아닙니다')
    if (!g.phase || !ISSUE_PHASES.includes(g.phase)) throw new GameError('wrong_phase', '발행 요청은 거래 활동부터 라이프 제출 단계까지 할 수 있습니다')
    const kind = teamKind(teamId)
    if (!kind) throw new GameError('not_issuer', '발행 요청을 할 수 없는 팀입니다', 403)
    const pending = db.prepare(`SELECT 1 FROM issue_requests WHERE group_id = ? AND status = 'pending'`).get(teamId)
    if (pending) throw new GameError('issue_pending', '수락을 기다리는 요청이 있습니다')
    const left = remainingFor(teamId, kind)
    if (amount > left) throw new GameError('limit_exceeded', `이번 일차 남은 ${RESOURCE_LABELS[kind]} 발행 가능량은 ${left}개입니다`)
    try {
      const info = db
        .prepare('INSERT INTO issue_requests (day, phase, group_id, kind, amount, requested_by) VALUES (?, ?, ?, ?, ?, ?)')
        .run(g.day, g.phase, teamId, kind, amount, by)
      return getIssue(Number(info.lastInsertRowid))!
    } catch (e) {
      // 같은 팀의 다른 요청이 먼저 들어감 (partial unique index)
      if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') throw new GameError('issue_pending', '수락을 기다리는 요청이 있습니다')
      throw e
    }
  })()
}

/** 관리자 수락/거절. 수락하면 팀 재화에 바로 더한다 */
export function decideIssue(id: number, accept: boolean, by: number): IssueRequestView {
  return db.transaction(() => {
    const g = getGameRow()
    const ok = db
      .prepare(`UPDATE issue_requests SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ? AND status = 'pending'`)
      .run(accept ? 'approved' : 'rejected', by, id).changes === 1
    if (!ok) {
      if (!getIssue(id)) throw new GameError('not_found', '', 404)
      throw new GameError('already_decided', '이미 처리된 요청입니다')
    }
    const r = getIssue(id)!
    if (accept) applyDeltas(r.teamId, { [r.kind]: r.amount }, { reason: 'issue', day: g.day, refId: r.id, by })
    return r
  })()
}

/** 게임 종료: 대기 요청 취소. 반환: 취소된 요청 (팀에 알린다) */
export function cancelPendingIssues(): IssueRequestView[] {
  const rows = (db.prepare(`${SELECT} WHERE r.status = 'pending'`).all() as IssueRow[]).map(toView)
  db.prepare(`UPDATE issue_requests SET status = 'cancelled', decided_at = datetime('now') WHERE status = 'pending'`).run()
  return rows.map((r) => ({ ...r, status: 'cancelled' as const }))
}

export function clearIssues() {
  db.prepare('DELETE FROM issue_requests').run()
}
