-- 게임 준비 단계 + 전체 리셋 (docs/96.게임준비_리셋.md)
-- setup(설정) → ready(준비: 참가자 입장·팀 선택) → running → ended

-- game.status 에 'ready' 추가 (SQLite 는 CHECK 를 바꿀 수 없어 테이블을 다시 만든다)
CREATE TABLE game_new (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  status               TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'ready', 'running', 'ended')),
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
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO game_new SELECT * FROM game;
DROP TABLE game;
ALTER TABLE game_new RENAME TO game;
INSERT OR IGNORE INTO game (id) VALUES (1);

-- 팀별 최대 인원 (테스트 계정 제외). 초기셋팅완료 때 합계만큼 팀 없는 PIN 을 만든다
ALTER TABLE groups ADD COLUMN capacity INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0);
UPDATE groups SET capacity = (SELECT COUNT(*) FROM users u WHERE u.group_id = groups.id AND u.role = 'member' AND u.is_test = 0);

-- 리셋해도 남는 고정 계정: 관리자(가장 먼저 만든 admin) + 프레젠테이션. 진행자(그 밖의 admin)는 리셋 때 삭제
ALTER TABLE users ADD COLUMN is_fixed INTEGER NOT NULL DEFAULT 0;
UPDATE users SET is_fixed = 1
 WHERE role = 'presenter'
    OR id = (SELECT MIN(id) FROM users WHERE role = 'admin');

-- 리셋이 스냅샷 복원 대신 전체 삭제로 바뀌어 더 이상 쓰지 않는다
DROP TABLE IF EXISTS game_snapshot;
