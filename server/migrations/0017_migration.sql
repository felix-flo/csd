-- 이주 (docs/100 N3): 일반 팀원이 다른 팀으로 신청 → 받는 팀 리더가 수락하면 즉시 소속 변경 (빈손)

-- 이주가 열리는 라운드 (관리자 설정, 기본 4. 총 라운드보다 크면 이주 없음)
ALTER TABLE game ADD COLUMN migration_start_day INTEGER NOT NULL DEFAULT 4 CHECK (migration_start_day >= 1);

CREATE TABLE IF NOT EXISTS migrations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day           INTEGER NOT NULL,                -- 신청한 라운드
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_group    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  to_group      INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  -- 취소 사유: self(본인) / admin(관리자) / leader(신청자가 리더가 됨) / inactive(탈락) / moved(다른 경로로 팀이 바뀜)
  cancel_reason TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT,
  decided_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);
-- 1인 대기 신청 1건 (동시에 두 번 눌러도 하나만)
CREATE UNIQUE INDEX IF NOT EXISTS idx_migrations_one_pending ON migrations(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_migrations_to ON migrations(to_group, status);
