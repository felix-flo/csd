-- 게임 진행: 일차·단계, 팀 재화, 리더 투표, 거래, 라이프 제출 (docs/95.게임진행_설계.md)

-- 팀별 테스트 계정 (시드 리더·팀원). 게임 설정의 "테스트 계정 포함" 이 꺼져 있으면 비활성 처리된다
ALTER TABLE users ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
UPDATE users SET is_test = 1
 WHERE role = 'member'
   AND pin IN ('WLDR', 'WMEM', 'YLDR', 'YMEM', 'BLDR', 'BMEM', 'RLDR', 'RMEM', 'ALDR', 'AMEM', 'CLDR', 'CMEM', 'DLDR', 'DMEM');

-- 게임 전역 상태 (1행)
CREATE TABLE IF NOT EXISTS game (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  status               TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'running', 'ended')),
  total_days           INTEGER,
  day                  INTEGER NOT NULL DEFAULT 0,
  phase                TEXT CHECK (phase IN ('leader', 'production', 'trade', 'council', 'life')),
  include_test         INTEGER NOT NULL DEFAULT 1,
  life_reserve_initial INTEGER NOT NULL DEFAULT 0 CHECK (life_reserve_initial >= 0),
  life_reserve         INTEGER NOT NULL DEFAULT 0 CHECK (life_reserve >= 0),
  aid_used             INTEGER NOT NULL DEFAULT 0,
  results              TEXT,                    -- 발표된 등수 JSON (GameResults)
  started_at           TEXT,
  ended_at             TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO game (id) VALUES (1);

-- 게임 시작 시점의 참가자 상태. 리셋하면 이대로 되돌린다 (팀 구성·리더·활성 여부)
CREATE TABLE IF NOT EXISTS game_snapshot (
  user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  group_id  INTEGER,
  is_leader INTEGER NOT NULL,
  active    INTEGER NOT NULL
);

-- 팀 재화. initial = 게임 설정의 초기값 (리셋 시 amount 를 여기로 되돌린다)
CREATE TABLE IF NOT EXISTS team_resources (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL CHECK (kind IN ('gem', 'gold', 'life', 'credit')),
  amount   INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  initial  INTEGER NOT NULL DEFAULT 0 CHECK (initial >= 0),
  PRIMARY KEY (group_id, kind)
);

-- 재화 변동 이력 (리셋 시 비운다)
CREATE TABLE IF NOT EXISTS resource_ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  delta        INTEGER NOT NULL,
  amount_after INTEGER NOT NULL,
  reason       TEXT NOT NULL,                  -- init | production | correction | aid | trade | trade_credit | life
  ref_id       INTEGER,                        -- 거래 id 등
  day          INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_group ON resource_ledger(group_id, id);

-- 리더 선출: 팀별·일차별 결과 + 무기명 투표
CREATE TABLE IF NOT EXISTS leader_elections (
  day       INTEGER NOT NULL,
  group_id  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status    TEXT NOT NULL DEFAULT 'voting' CHECK (status IN ('voting', 'tie', 'done')),
  leader_id INTEGER,
  tied      TEXT,                              -- 동표자 id JSON 배열
  tally     TEXT,                              -- { candidateId: 표 } JSON
  PRIMARY KEY (day, group_id)
);
CREATE TABLE IF NOT EXISTS leader_votes (
  day          INTEGER NOT NULL,
  group_id     INTEGER NOT NULL,
  voter_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, voter_id)
);

-- 거래. 요청~종료까지 시스템 전체에 1건만 (아래 partial unique index 가 DB 수준에서 보장)
CREATE TABLE IF NOT EXISTS trades (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  day           INTEGER NOT NULL,
  from_group    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  to_group      INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('requested', 'awaiting_credit', 'negotiating', 'completed', 'rejected', 'cancelled')),
  credit_payer  INTEGER,
  from_offer    TEXT,                          -- Resources JSON (제안 전 NULL)
  to_offer      TEXT,
  from_accepted INTEGER NOT NULL DEFAULT 0,
  to_accepted   INTEGER NOT NULL DEFAULT 0,
  closed_by     INTEGER,                       -- 거부·취소한 팀 id (관리자 강제 취소는 NULL)
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_one_active ON trades((1))
  WHERE status IN ('requested', 'awaiting_credit', 'negotiating');

-- 라이프 제출 (팀별·일차별 1회)
CREATE TABLE IF NOT EXISTS life_submissions (
  day          INTEGER NOT NULL,
  group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  saved        TEXT NOT NULL,                  -- 라이프를 받은 user id JSON 배열
  eliminated   TEXT NOT NULL,                  -- 탈락한 user id JSON 배열
  lives_used   INTEGER NOT NULL,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, group_id)
);
