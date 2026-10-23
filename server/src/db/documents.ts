/**
 * 마크다운 문서 (룰북). docs/98.룰북_팀별룰.md
 * - 전체 룰: slug 'rules' (group_id NULL). 모든 역할이 본다
 * - 팀 룰  : slug 'team-<groupId>' (group_id = 팀). 그 팀 팀원(게임 시작 후)과 관리자만 본다. 제목은 팀 이름으로 자동("○○ 팀 룰")
 *   팀을 추가하면 ensureTeamRules() 가 빈 문서를 만들고, 팀을 지우면 FK CASCADE 로 함께 지워진다. 게임 리셋 때는 유지
 * - previous_markdown: 직전 버전 1개 보관 (실수 복구용)
 */
import { db } from './index.js'
import type { DocumentInfo } from '../../../shared/types.js'

interface DocRow {
  slug: string
  title: string
  markdown: string
  previous_markdown: string | null
  updated_by: number | null
  updated_at: string
  group_id: number | null
  group_name: string | null
}

export const GLOBAL_RULES_SLUG = 'rules'

export function teamRuleSlug(teamId: number): string {
  return `team-${teamId}`
}

/** "화이트 팀" → "화이트 팀 룰", "그린" → "그린 팀 룰" */
export function teamRuleTitle(teamName: string): string {
  return teamName.endsWith('팀') ? `${teamName} 룰` : `${teamName} 팀 룰`
}

function toDoc(r: DocRow): DocumentInfo {
  return {
    slug: r.slug,
    title: r.group_id != null ? teamRuleTitle(r.group_name ?? '') : r.title,
    markdown: r.markdown,
    hasPrevious: r.previous_markdown != null,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
    teamId: r.group_id,
  }
}

const SELECT = 'SELECT d.*, g.name AS group_name FROM documents d LEFT JOIN groups g ON g.id = d.group_id'

/** 팀마다 팀 룰 행이 있도록 (팀 추가 직후에도 동작하게 조회 전에 호출) */
export function ensureTeamRules() {
  db.prepare(`INSERT OR IGNORE INTO documents (slug, title, markdown, group_id) SELECT 'team-' || id, '', '', id FROM groups`).run()
}

export function getDocument(slug: string): DocumentInfo | null {
  const row = db.prepare(`${SELECT} WHERE d.slug = ?`).get(slug) as DocRow | undefined
  return row ? toDoc(row) : null
}

export function getTeamRule(teamId: number): DocumentInfo | null {
  ensureTeamRules()
  return getDocument(teamRuleSlug(teamId))
}

/** 관리자용: 모든 팀 룰 (팀 순서) */
export function listTeamRules(): DocumentInfo[] {
  ensureTeamRules()
  return (db.prepare(`${SELECT} WHERE d.group_id IS NOT NULL ORDER BY d.group_id`).all() as DocRow[]).map(toDoc)
}

/** 저장 시 직전 내용을 previous_markdown 에 보관 (내용이 같으면 보관하지 않음). 팀 룰의 title 은 무시된다(자동 제목) */
export function updateDocument(slug: string, input: { title: string; markdown: string }, userId: number): DocumentInfo | null {
  const info = db
    .prepare(
      `UPDATE documents
       SET previous_markdown = CASE WHEN markdown = ? THEN previous_markdown ELSE markdown END,
           title = ?, markdown = ?, updated_by = ?, updated_at = datetime('now')
       WHERE slug = ?`,
    )
    .run(input.markdown, input.title, input.markdown, userId, slug)
  return info.changes === 1 ? getDocument(slug) : null
}

/** 직전 버전으로 되돌리기 (현재 내용과 맞바꿈) */
export function restoreDocument(slug: string, userId: number): DocumentInfo | null {
  const info = db
    .prepare(
      `UPDATE documents
       SET markdown = previous_markdown, previous_markdown = markdown, updated_by = ?, updated_at = datetime('now')
       WHERE slug = ? AND previous_markdown IS NOT NULL`,
    )
    .run(userId, slug)
  return info.changes === 1 ? getDocument(slug) : null
}
