-- 리더 선출: 팀원 투표 → 진행자 수동 지정 (2026-10-30 결정, docs/100 §7-6)
-- 팀이 오프라인에서 협의해 진행자에게 알리면 진행자가 지정한다. 투표·동표·득표 열은 없앤다.
-- status: pending(지정 대기) / done(지정 완료 또는 자동: 활성 팀원 0·1명, 단계 넘김 시 현 리더 유지)
CREATE TABLE leader_elections_new (
  day       INTEGER NOT NULL,
  group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  leader_id INTEGER,
  PRIMARY KEY (day, group_id)
);
INSERT INTO leader_elections_new (day, group_id, status, leader_id)
  SELECT day, group_id, CASE WHEN status = 'done' THEN 'done' ELSE 'pending' END, leader_id FROM leader_elections;
DROP TABLE leader_elections;
ALTER TABLE leader_elections_new RENAME TO leader_elections;
DROP TABLE IF EXISTS leader_votes;
