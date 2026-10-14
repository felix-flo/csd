-- 초기 스키마. 룰 확정 후 재화/거래/전쟁 테이블을 추가 마이그레이션으로 확장한다.

CREATE TABLE IF NOT EXISTS groups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,          -- 'a', 'b', ...
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'presenter', 'member')),
  group_id   INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  is_leader  INTEGER NOT NULL DEFAULT 0,
  pin_hash   TEXT NOT NULL UNIQUE,          -- HMAC-SHA256(PIN_SECRET, pin)
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,          -- SHA-256(token)
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- 이벤트 outbox / 로그. 모든 알림은 먼저 여기에 기록된 뒤 Socket.IO 로 전송된다.
-- 클라이언트는 마지막으로 받은 id 를 저장해 두고 재접속 시 그 이후 이벤트를 replay 받는다.
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,                -- 'notice' | 'system' | (추후 'trade.request' 등)
  scope       TEXT NOT NULL CHECK (scope IN ('all', 'role', 'group', 'user')),
  target_id   INTEGER,                      -- group_id 또는 user_id
  target_role TEXT,                         -- scope='role' 일 때
  payload     TEXT NOT NULL DEFAULT '{}',   -- JSON
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_scope ON events(scope, target_id, id);

-- 게임 전역 상태 (라운드, 단계 등) key-value. 룰 확정 후 사용.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
