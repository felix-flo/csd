-- 테러리스트 (docs/100 N4): 준비 상태에서 팀을 고르면 "운명의 카드" 태양/달 선택 (달 = 테러리스트 후보) → 관리자가 후보 중에서 직접 지정

-- 1인 1회 (되돌릴 수 없음)
CREATE TABLE IF NOT EXISTS fate_choices (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  fate       TEXT NOT NULL CHECK (fate IN ('sun', 'moon')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 관리자가 지정한 테러리스트 (준비 상태에서만 바꾼다)
CREATE TABLE IF NOT EXISTS spies (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 게임 시작 순간의 활성 참가자 id JSON. 테러리스트 적립 기준 "시작 이후 탈락자" = 이 중 지금 비활성인 사람
ALTER TABLE game ADD COLUMN start_roster TEXT;
