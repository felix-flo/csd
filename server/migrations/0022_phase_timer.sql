-- 단계 타이머 (docs/103 §14): 거래 15분 · 리더 협의 5분. 단계가 바뀐 시각과 "시간 종료" 알림을 보냈는지
ALTER TABLE game ADD COLUMN phase_started_at TEXT;
ALTER TABLE game ADD COLUMN phase_timer_fired INTEGER NOT NULL DEFAULT 0;
