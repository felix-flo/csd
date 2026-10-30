-- 최종 투표 기본표 (2026-10-30 결정): 기본 1표는 리더만. 일반 팀원은 라이프 투표권 안건 통과 시 팀 라이프 1개(extra)로만 투표
-- base = 투표 당시 리더였으면 1, 아니면 0. 득표 = base + extra. 기존 행은 모두 1인 1표 시절이라 1
ALTER TABLE final_votes ADD COLUMN base INTEGER NOT NULL DEFAULT 1 CHECK (base IN (0, 1));
