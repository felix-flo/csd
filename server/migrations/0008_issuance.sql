-- 화이트팀 보석 · 옐로우팀 골드 발행 요청 (docs/97.보석골드_발행.md)

-- 일차(턴)당 발행 한도. 보석은 매 일차 이 값까지(이월 없음), 골드는 매 일차 이 값씩 쌓인다(안 쓴 만큼 이월)
ALTER TABLE game ADD COLUMN gem_issue_limit INTEGER NOT NULL DEFAULT 250 CHECK (gem_issue_limit >= 0);
ALTER TABLE game ADD COLUMN gold_issue_limit INTEGER NOT NULL DEFAULT 200 CHECK (gold_issue_limit >= 0);

-- 리더의 발행 요청 → 관리자 수락/거절. 대기 중(pending)·수락(approved) 수량이 한도를 차지한다
CREATE TABLE IF NOT EXISTS issue_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  day          INTEGER NOT NULL,                -- 요청한 일차 (한도는 이 일차 기준)
  phase        TEXT NOT NULL,
  group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('gem', 'gold')),
  amount       INTEGER NOT NULL CHECK (amount > 0),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at   TEXT
);
-- 팀당 대기 중 요청 1건 (동시에 눌러도 하나만 들어간다)
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_one_pending ON issue_requests(group_id) WHERE status = 'pending';
