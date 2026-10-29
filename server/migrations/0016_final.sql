-- 최종장 (docs/100 N2 + D7): running → final(vote → result → settle → spy) → ended
-- game.status 에 'final' 추가 (SQLite 는 CHECK 를 바꿀 수 없어 테이블을 다시 만든다) + 최종장 진행 컬럼

CREATE TABLE game_new (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  status               TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'ready', 'running', 'final', 'ended')),
  total_days           INTEGER,
  day                  INTEGER NOT NULL DEFAULT 0,
  phase                TEXT CHECK (phase IN ('leader', 'production', 'trade', 'council', 'life')),
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
  last_issue_phases    TEXT NOT NULL DEFAULT '["life"]',
  tab_login            INTEGER NOT NULL DEFAULT 0,
  -- 최종장 단계 (final 상태에서만. spy 는 N4 스파이 구현 때 사용)
  final_step           TEXT CHECK (final_step IN ('vote', 'result', 'settle', 'spy')),
  -- 마지막 라운드 필수 안건 "남은 라이프를 최종 투표권으로" : NULL 미입력 / 0 부결 / 1 통과
  life_vote_passed     INTEGER CHECK (life_vote_passed IN (0, 1)),
  -- 최종 투표 마감 여부 (마감 전에는 득표를 아무도 볼 수 없다)
  votes_closed         INTEGER NOT NULL DEFAULT 0,
  -- 동점일 때 가위바위보 결과 (화이트 승 = 보석, 옐로우 승 = 골드)
  tiebreak             TEXT CHECK (tiebreak IN ('white', 'yellow')),
  -- 채택 화폐 (마감 후 확정)
  adopted              TEXT CHECK (adopted IN ('gem', 'gold'))
);
INSERT INTO game_new (id, status, total_days, day, phase, include_test, life_reserve_initial, life_reserve, aid_used, results,
                      started_at, ended_at, updated_at, gem_issue_limit, gold_issue_limit, last_issue_phases, tab_login)
  SELECT id, status, total_days, day, phase, include_test, life_reserve_initial, life_reserve, aid_used,
         NULL, -- 예전 등수 발표 결과(ScoreRule)는 형식이 달라 버린다
         started_at, ended_at, updated_at, gem_issue_limit, gold_issue_limit, last_issue_phases, tab_login
  FROM game;
DROP TABLE game;
ALTER TABLE game_new RENAME TO game;
INSERT OR IGNORE INTO game (id) VALUES (1);

-- 최종 투표: 1인 1회 (수정 불가). extra = 라이프 투표권 사용(+1표, 팀 라이프 1개 소모)
CREATE TABLE IF NOT EXISTS final_votes (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  choice     TEXT NOT NULL CHECK (choice IN ('gem', 'gold')),
  extra      INTEGER NOT NULL DEFAULT 0 CHECK (extra IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
