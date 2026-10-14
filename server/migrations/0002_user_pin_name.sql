-- 관리자가 PIN 을 열람/리셋할 수 있도록 평문 PIN 을 함께 저장한다 (조회는 계속 pin_hash 로).
-- name_set: 참가자가 첫 로그인 때 본인 이름을 입력했는지 여부 (0 이면 이름 입력 화면 표시)
ALTER TABLE users ADD COLUMN pin TEXT;
ALTER TABLE users ADD COLUMN name_set INTEGER NOT NULL DEFAULT 1;
