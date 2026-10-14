import { db } from './index.js'
import type { DocumentInfo } from '../../../shared/types.js'

interface DocRow {
  slug: string
  title: string
  markdown: string
  previous_markdown: string | null
  updated_by: number | null
  updated_at: string
}

function toDoc(r: DocRow): DocumentInfo {
  return {
    slug: r.slug,
    title: r.title,
    markdown: r.markdown,
    hasPrevious: r.previous_markdown != null,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  }
}

export function getDocument(slug: string): DocumentInfo | null {
  const row = db.prepare('SELECT * FROM documents WHERE slug = ?').get(slug) as DocRow | undefined
  return row ? toDoc(row) : null
}

/** 저장 시 직전 내용을 previous_markdown 에 보관 (내용이 같으면 보관하지 않음) */
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
