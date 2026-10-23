/**
 * 진행자 수: 진행자(admin) 계정을 **추가만** 한다. 줄이는 것은 거부 (진행자는 게임 리셋 때 고정 관리자만 남기고 삭제된다).
 * 참가자 계정은 여기서 만들지 않는다 — 게임 설정의 팀별 최대 인원으로 "초기셋팅완료" 때 팀 없는 PIN 을 만든다 (game.ts).
 */
import { db } from './index.js'
import { createUser, generatePin } from './users.js'

export interface RosterInput {
  staff: number
}

export interface RosterResult {
  created: number
}

export class RosterError extends Error {
  constructor(public code: 'cannot_shrink', public detail: string) {
    super(`${code}: ${detail}`)
  }
}

export function applyRoster(input: RosterInput): RosterResult {
  return db.transaction(() => {
    const admins = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get() as { n: number }).n
    if (input.staff < admins) throw new RosterError('cannot_shrink', `진행자 현재 ${admins}명`)
    let created = 0
    for (let i = admins + 1; i <= input.staff; i++) {
      createUser({ name: `진행자 ${i}`, role: 'admin', pin: generatePin() })
      created++
    }
    return { created }
  })()
}
