-- 마지막 라운드에 "마지막 발행" 단계 추가 (리더 협의 → 마지막 발행 → 라이프 제출).
-- 발행 시점이 단계로 고정되므로 관리자가 고르던 last_issue_phases 는 지운다.
-- SQLite 는 CHECK 를 바꿀 수 없어 테이블을 다시 만든다

CREATE TABLE game_new (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  status               TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'ready', 'running', 'final', 'ended')),
  total_days           INTEGER,
  day                  INTEGER NOT NULL DEFAULT 0,
  phase                TEXT CHECK (phase IN ('leader', 'production', 'trade', 'council', 'last_issue', 'life')),
  include_test         INTEGER NOT NULL DEFAULT 1,
  life_reserve_initial INTEGER NOT NULL DEFAULT 0 CHECK (life_reserve_initial >= 0),
  life_reserve         INTEGER NOT NULL DEFAULT 0 CHECK (life_reserve >= 0),
  aid_used             INTEGER NOT NULL DEFAULT 0,
  results              TEXT,
  started_at           TEXT,
  ended_at             TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  gem_issue_limit      INTEGER NOT NULL DEFAULT 250 CHECK (gem_issue_limit >= 0),
  gold_issue_limit     INTEGER NOT NULL DEFAULT 200 CHECK (gold_issue_limit >= 0),
  tab_login            INTEGER NOT NULL DEFAULT 0,
  final_step           TEXT CHECK (final_step IN ('vote', 'result', 'settle', 'spy')),
  life_vote_passed     INTEGER CHECK (life_vote_passed IN (0, 1)),
  votes_closed         INTEGER NOT NULL DEFAULT 0,
  tiebreak             TEXT CHECK (tiebreak IN ('white', 'yellow')),
  adopted              TEXT CHECK (adopted IN ('gem', 'gold')),
  migration_start_day  INTEGER NOT NULL DEFAULT 4 CHECK (migration_start_day >= 1),
  start_roster         TEXT,
  phase_started_at     TEXT,
  phase_timer_fired    INTEGER NOT NULL DEFAULT 0,
  opening_step         TEXT
);

INSERT INTO game_new (id, status, total_days, day, phase, include_test, life_reserve_initial, life_reserve, aid_used, results, started_at, ended_at, updated_at,
  gem_issue_limit, gold_issue_limit, tab_login, final_step, life_vote_passed, votes_closed, tiebreak, adopted, migration_start_day, start_roster, phase_started_at, phase_timer_fired, opening_step)
SELECT id, status, total_days, day, phase, include_test, life_reserve_initial, life_reserve, aid_used, results, started_at, ended_at, updated_at,
  gem_issue_limit, gold_issue_limit, tab_login, final_step, life_vote_passed, votes_closed, tiebreak, adopted, migration_start_day, start_roster, phase_started_at, phase_timer_fired, opening_step
FROM game;

DROP TABLE game;
ALTER TABLE game_new RENAME TO game;
INSERT OR IGNORE INTO game (id) VALUES (1);
