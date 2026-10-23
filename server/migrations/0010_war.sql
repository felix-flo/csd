-- 전쟁 (docs/99.전쟁.md)
-- 하루(일차)에 게임 전체 1회. 거래 활동 단계에서 리더가 상대 팀을 골라 선포 비용을 내면 선포 → 관리자가 오프라인 결과로 승패 지정

-- 일차별 선포 비용 (보석·골드·크레딧). 1일차는 게임 설정, 이후는 관리자가 전날 끝나기 전에 입력해야 다음 날로 넘어간다
CREATE TABLE IF NOT EXISTS war_costs (
  day    INTEGER PRIMARY KEY,
  gem    INTEGER NOT NULL DEFAULT 0 CHECK (gem >= 0),
  gold   INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
  credit INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0)
);

CREATE TABLE IF NOT EXISTS wars (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day         INTEGER NOT NULL UNIQUE,         -- 하루 1회 (취소·무승부도 그날 1회로 친다)
  attacker    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  defender    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'declared' CHECK (status IN ('declared', 'attacker_won', 'defender_won', 'draw', 'cancelled')),
  cost        TEXT NOT NULL,                   -- 낸 비용 Resources JSON (소멸)
  spoils      TEXT,                            -- 승리팀이 빼앗은 재화 Resources JSON
  declared_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at  TEXT
);
-- 진행 중 전쟁 1건 (선포~결과)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wars_one_active ON wars((1)) WHERE status = 'declared';
