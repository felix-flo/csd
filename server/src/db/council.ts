/**
 * 리더간 협의 결과 (docs/100.최종룰_차이_결정사항.md D2).
 *   리더들이 오프라인으로 협의하고, 관리자가 리더 협의 단계에서 결과를 입력한다.
 *
 * 규칙:
 * - 원조는 주는 팀 기준 라운드(일차)당 1회. 받는 팀은 제한 없음: council_actions PRIMARY KEY (day, group_id)
 *   → 관리자 2명이 동시에 눌러도 1건만 들어간다
 * - 기록과 재화 이동은 한 트랜잭션. 주는 팀 재화가 부족하면 기록까지 되돌린다
 */
import { db } from './index.js'
import { applyDeltas, negate } from './resources.js'
import { GameError } from './gameError.js'
import type { CouncilAidView, Resources } from '../../../shared/game.js'

interface CouncilRow {
  day: number
  group_id: number
  target_group: number
  amounts: string
}

/** 원조 기록 + 재화 이동. 같은 라운드에 이미 준 팀이면 aid_used_today */
export function recordAid(day: number, fromTeam: number, toTeam: number, amounts: Resources, by: number) {
  db.transaction(() => {
    const ok = db
      .prepare(`INSERT INTO council_actions (day, group_id, kind, target_group, amounts, created_by)
                VALUES (?, ?, 'aid', ?, ?, ?) ON CONFLICT DO NOTHING`)
      .run(day, fromTeam, toTeam, JSON.stringify(amounts), by).changes === 1
    if (!ok) throw new GameError('aid_used_today', '이번 라운드에 이미 원조했습니다')
    applyDeltas(fromTeam, negate(amounts), { reason: 'aid', day, by })
    applyDeltas(toTeam, amounts, { reason: 'aid', day, by })
  })()
}

/** 해당 라운드의 원조 (입력 순) */
export function listAids(day: number): CouncilAidView[] {
  const rows = db
    .prepare(`SELECT day, group_id, target_group, amounts FROM council_actions WHERE day = ? AND kind = 'aid' ORDER BY created_at, rowid`)
    .all(day) as CouncilRow[]
  return rows.map((r) => ({ fromTeamId: r.group_id, toTeamId: r.target_group, amounts: JSON.parse(r.amounts) as Resources }))
}

/** 게임 시작·리셋 */
export function clearCouncilActions() {
  db.prepare('DELETE FROM council_actions').run()
}
