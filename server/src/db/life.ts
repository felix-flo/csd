/**
 * 라이프 제출. 리더가 팀원(본인 포함) 중 라이프로 살릴 사람을 고르면
 * - 고른 인원만큼 팀 라이프를 소모하고
 * - 고르지 않은 활성 팀원은 바로 탈락(비활성) 처리한다. 세션 종료(refresh 폐기·소켓 끊기)는 라우터가 한다.
 * - 리더가 탈락하면 남은 활성 팀원 중 id 최소가 리더를 잇는다 (ensureLeader).
 * 팀별·일차별 1회. 활성 팀원이 1명뿐인 팀은 제출하지 않는다 (isLifeExempt: 자동 생존, 라이프 소모 없음).
 */
import { db } from './index.js'
import { listGroupMembers, listGroups, setUsersActive } from './users.js'
import { ensureLeader } from './teams.js'
import { applyDeltas, getTeamResources } from './resources.js'
import { GameError } from './gameError.js'
import { isLifeExempt } from '../../../shared/game.js'
import type { LifeSubmissionView } from '../../../shared/game.js'

interface SubmissionRow {
  saved: string
  eliminated: string
  lives_used: number
  created_at: string
}

export function getLifeSubmission(day: number, teamId: number): LifeSubmissionView | null {
  const r = db.prepare('SELECT saved, eliminated, lives_used, created_at FROM life_submissions WHERE day = ? AND group_id = ?').get(day, teamId) as
    | SubmissionRow
    | undefined
  return r ? { saved: JSON.parse(r.saved), eliminated: JSON.parse(r.eliminated), livesUsed: r.lives_used, createdAt: r.created_at } : null
}

export function submitLife(day: number, teamId: number, by: number, savedIds: number[]): LifeSubmissionView {
  return db.transaction(() => {
    if (getLifeSubmission(day, teamId)) throw new GameError('already_submitted', '이미 제출했습니다')
    const members = listGroupMembers(teamId).map((m) => m.id)
    if (isLifeExempt(members.length)) throw new GameError('not_required', '팀원이 1명이라 라이프 제출이 없습니다')
    const saved = [...new Set(savedIds)]
    if (saved.some((id) => !members.includes(id))) throw new GameError('bad_member', '현재 팀원만 선택할 수 있습니다', 400)
    const lives = getTeamResources(teamId).life
    if (saved.length > lives) throw new GameError('insufficient', `라이프가 부족합니다 (보유 ${lives})`)
    const eliminated = members.filter((id) => !saved.includes(id))
    if (saved.length > 0) applyDeltas(teamId, { life: -saved.length }, { reason: 'life', day, by })
    setUsersActive(eliminated, false)
    db.prepare('INSERT INTO life_submissions (day, group_id, saved, eliminated, lives_used, submitted_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(day, teamId, JSON.stringify(saved), JSON.stringify(eliminated), saved.length, by)
    ensureLeader(teamId)
    return getLifeSubmission(day, teamId)!
  })()
}

/** 모든 팀 제출 완료. 활성 팀원이 없거나 1명뿐인 팀(제출 불필요)은 완료로 본다 */
export function allLivesDone(day: number): boolean {
  return listGroups().every((g) => {
    if (getLifeSubmission(day, g.id)) return true
    const n = listGroupMembers(g.id).length
    return n === 0 || isLifeExempt(n)
  })
}

export function clearLifeSubmissions() {
  db.prepare('DELETE FROM life_submissions').run()
}
