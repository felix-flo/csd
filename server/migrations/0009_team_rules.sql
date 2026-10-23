-- 룰북 = 전체 룰(slug 'rules') + 팀별 룰 (docs/98.룰북_팀별룰.md)
-- 팀 룰: slug 'team-<groupId>', group_id = 팀. 팀을 지우면 함께 지워진다. 제목은 팀 이름에서 자동으로 만든다("○○ 팀 룰")
ALTER TABLE documents ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_group ON documents(group_id) WHERE group_id IS NOT NULL;

INSERT OR IGNORE INTO documents (slug, title, markdown, group_id)
SELECT 'team-' || id, '', '', id FROM groups;
