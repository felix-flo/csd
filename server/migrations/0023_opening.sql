-- 오프닝: 게임 시작 뒤 1라운드 전까지 (영상 → 로고 → 룰 설명 → 점심). NULL 이면 오프닝이 아니다.
ALTER TABLE game ADD COLUMN opening_step TEXT;
