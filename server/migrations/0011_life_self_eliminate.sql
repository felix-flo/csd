-- 라이프 제출: 리더가 살릴 인원 수만 정하고 생존자는 무작위 (docs/100.최종룰_차이_결정사항.md D1)
-- 리더 자진 탈락 여부를 결과와 함께 남긴다
ALTER TABLE life_submissions ADD COLUMN self_eliminated INTEGER NOT NULL DEFAULT 0;
