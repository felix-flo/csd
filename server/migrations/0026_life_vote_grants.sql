-- 라이프 투표권: 안건이 통과하면 최종 투표가 열릴 때 팀마다 남은 라이프 수만큼 팀원을 무작위로 뽑는다 (1인 1장).
-- 뽑힌 사람의 표는 2표로 계산한다 (final_votes.extra)
CREATE TABLE IF NOT EXISTS life_vote_grants (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
