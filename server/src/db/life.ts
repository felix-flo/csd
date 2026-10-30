/**
 * 라이프 제출 (docs/100.최종룰_차이_결정사항.md D1). 리더가 살릴 인원 수(= 쓸 라이프 수)와 자진 탈락 여부만 정하면
 * - 자진 탈락 안 함: 리더는 생존, 나머지 (N−1)자리는 리더 외 팀원 중 무작위
 * - 자진 탈락: N자리 모두 리더 외 팀원 중 무작위
 * - 라이프 0개 팀: 숫자 없이 1명만 생존 (리더, 자진 탈락이면 리더 외 무작위 1명). 라이프 소모 없음
 * 쓴 개수만큼 팀 라이프를 소모하고, 살지 못한 활성 팀원은 바로 탈락(비활성) 처리한다. 세션 종료(refresh 폐기·소켓 끊기)는 라우터가 한다.
 * 리더가 탈락하면 남은 활성 팀원 중 id 최소가 리더를 잇는다 (ensureLeader).
 * 팀별·일차별 1회. 활성 팀원이 1명이고 라이프가 0개인 팀만 제출하지 않는다 (isLifeExempt: 자동 생존, 탈락 없음).
 * 1명이라도 라이프가 있으면 제출해야 하고 라이프 1개를 소모해 생존한다. 자진 탈락은 할 수 없다 (2026-10-30 docs/103 §8)
 */
import { randomInt } from 'node:crypto'
import { db } from './index.js'
import { listGroupMembers, listGroups, setUsersActive } from './users.js'
import { ensureLeader } from './teams.js'
import { applyDeltas, getTeamResources } from './resources.js'
import { GameError } from './gameError.js'
import { isLifeExempt, lifeSubmitMax } from '../../../shared/game.js'
import type { LifeSubmissionView } from '../../../shared/game.js'

interface SubmissionRow {
  saved: string
  eliminated: string
  lives_used: number
  self_eliminated: number
  created_at: string
}

export function getLifeSubmission(day: number, teamId: number): LifeSubmissionView | null {
  const r = db.prepare('SELECT saved, eliminated, lives_used, self_eliminated, created_at FROM life_submissions WHERE day = ? AND group_id = ?').get(day, teamId) as
    | SubmissionRow
    | undefined
  if (!r) return null
  const saved = JSON.parse(r.saved) as number[]
  const eliminated = JSON.parse(r.eliminated) as number[]
  return { saved, eliminated, names: namesOf([...saved, ...eliminated]), livesUsed: r.lives_used, selfEliminated: r.self_eliminated === 1, createdAt: r.created_at }
}

/** 비활성(탈락) 계정 포함 이름 조회. 탈락자는 listGroupMembers 에서 빠지므로 결과 표시용 이름을 따로 싣는다 */
function namesOf(ids: number[]): Record<number, string> {
  if (ids.length === 0) return {}
  const rows = db.prepare(`SELECT id, name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { id: number; name: string }[]
  return Object.fromEntries(rows.map((u) => [u.id, u.name]))
}

/** 무작위로 n명 (Fisher–Yates, crypto 난수) */
function pickRandom(ids: number[], n: number): number[] {
  const a = [...ids]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a.slice(0, n)
}

export function submitLife(day: number, teamId: number, leaderId: number, input: { count: number; selfEliminate: boolean }): LifeSubmissionView {
  return db.transaction(() => {
    if (getLifeSubmission(day, teamId)) throw new GameError('already_submitted', '이미 제출했습니다')
    const members = listGroupMembers(teamId)
    const lives = getTeamResources(teamId).life
    if (isLifeExempt(members.length, lives)) throw new GameError('not_required', '팀원이 1명이고 라이프가 없어 라이프 제출이 없습니다')
    if (!members.some((m) => m.id === leaderId && m.isLeader)) throw new GameError('not_leader', '리더만 할 수 있습니다', 403)
    const others = members.filter((m) => m.id !== leaderId).map((m) => m.id)
    const { count, selfEliminate } = input
    if (members.length === 1 && selfEliminate) throw new GameError('bad_count', '팀원이 1명이면 자진 탈락할 수 없습니다', 400)

    let saved: number[]
    if (lives === 0) {
      if (count !== 0) throw new GameError('bad_count', '라이프가 없어 1명만 생존합니다', 400)
      saved = selfEliminate ? pickRandom(others, 1) : [leaderId]
    } else {
      const max = lifeSubmitMax(members.length, lives, selfEliminate)
      if (count < 1 || count > max) throw new GameError('bad_count', `살릴 인원은 1~${max}명입니다`, 400)
      saved = selfEliminate ? pickRandom(others, count) : [leaderId, ...pickRandom(others, count - 1)]
      applyDeltas(teamId, { life: -count }, { reason: 'life', day, by: leaderId })
    }
    const eliminated = members.map((m) => m.id).filter((id) => !saved.includes(id))
    setUsersActive(eliminated, false)
    db.prepare('INSERT INTO life_submissions (day, group_id, saved, eliminated, lives_used, self_eliminated, submitted_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(day, teamId, JSON.stringify(saved), JSON.stringify(eliminated), lives === 0 ? 0 : count, selfEliminate ? 1 : 0, leaderId)
    ensureLeader(teamId)
    return getLifeSubmission(day, teamId)!
  })()
}

/** 모든 팀 제출 완료. 활성 팀원이 없거나 1명+라이프 0개인 팀(제출 불필요)은 완료로 본다 */
export function allLivesDone(day: number): boolean {
  return listGroups().every((g) => {
    if (getLifeSubmission(day, g.id)) return true
    const n = listGroupMembers(g.id).length
    return n === 0 || isLifeExempt(n, getTeamResources(g.id).life)
  })
}

export function clearLifeSubmissions() {
  db.prepare('DELETE FROM life_submissions').run()
}
