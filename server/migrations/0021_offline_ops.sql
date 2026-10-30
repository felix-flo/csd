-- 2026-10-30 운영 테스트 2차 (docs/103)
-- §10 거래: 리더 간 요청·협상 → 진행자가 내용을 입력하고 두 리더가 수락. 상태를 proposed/completed/rejected/cancelled 로 재구성
CREATE TABLE trades_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day           INTEGER NOT NULL,
  from_group    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  to_group      INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('proposed', 'completed', 'rejected', 'cancelled')),
  credit_payer  INTEGER NOT NULL,              -- 수수료(크레딧 1개)를 내는 팀
  from_offer    TEXT NOT NULL,                 -- from 팀이 주는 재화 Resources JSON
  to_offer      TEXT NOT NULL,
  from_accepted INTEGER NOT NULL DEFAULT 0,
  to_accepted   INTEGER NOT NULL DEFAULT 0,
  closed_by     INTEGER,                       -- 거부한 팀 id (관리자 강제 취소·단계 종료는 NULL)
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 옛 기록: 완료·거부·취소만 남기고 진행 중이던 것은 취소로
INSERT INTO trades_new (id, day, from_group, to_group, status, credit_payer, from_offer, to_offer, from_accepted, to_accepted, closed_by, created_by, created_at, updated_at)
  SELECT id, day, from_group, to_group,
         CASE WHEN status IN ('completed', 'rejected') THEN status ELSE 'cancelled' END,
         COALESCE(credit_payer, from_group), COALESCE(from_offer, '{"gem":0,"gold":0,"life":0,"credit":0}'), COALESCE(to_offer, '{"gem":0,"gold":0,"life":0,"credit":0}'),
         from_accepted, to_accepted, closed_by, created_by, created_at, updated_at
  FROM trades;
DROP TABLE trades;
ALTER TABLE trades_new RENAME TO trades;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_one_active ON trades((1)) WHERE status = 'proposed';

-- §4 전쟁: 승인 단계 폐지. pending/rejected 상태 제거, 선포 즉시 declared
CREATE TABLE wars_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day         INTEGER NOT NULL,
  attacker    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  defender    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'declared' CHECK (status IN ('declared', 'attacker_won', 'defender_won', 'draw', 'cancelled')),
  cost        TEXT NOT NULL,
  spoils      TEXT,
  declared_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at  TEXT
);
INSERT INTO wars_new (id, day, attacker, defender, status, cost, spoils, declared_by, decided_by, created_at, decided_at)
  SELECT id, day, attacker, defender, CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END, cost, spoils, declared_by, decided_by, created_at, decided_at
  FROM wars WHERE status != 'rejected';
DROP TABLE wars;
ALTER TABLE wars_new RENAME TO wars;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wars_one_per_day ON wars(day);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wars_one_active ON wars((1)) WHERE status = 'declared';

-- §12 리더 협의: 다음 라운드 전쟁 허용/제재. 행이 없으면 허용
CREATE TABLE IF NOT EXISTS war_rules (
  day     INTEGER PRIMARY KEY,
  allowed INTEGER NOT NULL DEFAULT 1 CHECK (allowed IN (0, 1))
);
