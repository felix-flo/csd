-- 리더간 협의 결과 (docs/100.최종룰_차이_결정사항.md D2)
-- 주는 팀(리더)마다 라운드(일차)당 1건. 지금은 원조만, 제재(N1)를 만들면 같은 표에 kind='sanction' 으로 넣어 "원조+제재 합산 1건"
-- game.aid_used (게임 전체 1회) 는 더 이상 쓰지 않는다
CREATE TABLE IF NOT EXISTS council_actions (
  day          INTEGER NOT NULL,
  group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,  -- 주는 팀
  kind         TEXT NOT NULL DEFAULT 'aid' CHECK (kind IN ('aid')),
  target_group INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,  -- 받는 팀
  amounts      TEXT NOT NULL,                                             -- Resources JSON
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, group_id)
);
