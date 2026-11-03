-- 라이프 제출 결과는 모든 팀이 제출한 뒤 한꺼번에 발표한다. 발표 전에는 탈락 처리도 하지 않는다
ALTER TABLE life_submissions ADD COLUMN revealed INTEGER NOT NULL DEFAULT 0;
