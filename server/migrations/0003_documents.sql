-- 관리자가 작성/수정하고 모든 역할이 읽는 마크다운 문서 (룰 등).
-- previous_markdown: 직전 버전 1개 보관 (실수 복구용)
CREATE TABLE IF NOT EXISTS documents (
  slug              TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  markdown          TEXT NOT NULL DEFAULT '',
  previous_markdown TEXT,
  updated_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO documents (slug, title, markdown) VALUES (
  'rules',
  '게임 룰',
  '# 게임 룰' || char(10) || char(10) || '진행자가 작성 중입니다.'
);
