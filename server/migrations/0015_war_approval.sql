-- 전쟁 선포 승인 (docs/99.전쟁.md §8)
-- 리더 선포 → pending (관리자 승인 대기) → declared (전쟁 중) / rejected (거절, 라운드당 1회에 포함하지 않음)
-- SQLite 는 CHECK 를 바꿀 수 없어 테이블을 다시 만든다
CREATE TABLE wars_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day           INTEGER NOT NULL,
  attacker      INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  defender      INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'rejected', 'declared', 'attacker_won', 'defender_won', 'draw', 'cancelled')),
  cost          TEXT NOT NULL,                   -- 선포 비용 Resources JSON (승인될 때 차감·소멸)
  spoils        TEXT,                            -- 승리팀이 빼앗은 재화 Resources JSON
  reject_reason TEXT,                            -- 거절 사유 (선택)
  declared_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT
);
INSERT INTO wars_new (id, day, attacker, defender, status, cost, spoils, declared_by, decided_by, created_at, decided_at)
  SELECT id, day, attacker, defender, status, cost, spoils, declared_by, decided_by, created_at, decided_at FROM wars;
DROP TABLE wars;
ALTER TABLE wars_new RENAME TO wars;
-- 라운드(일차)당 1건 — 거절된 선포는 세지 않는다
CREATE UNIQUE INDEX IF NOT EXISTS idx_wars_one_per_day ON wars(day) WHERE status != 'rejected';
-- 승인 대기·진행 중 합쳐 1건
CREATE UNIQUE INDEX IF NOT EXISTS idx_wars_one_active ON wars((1)) WHERE status IN ('pending', 'declared');
