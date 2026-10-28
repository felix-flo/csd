-- 마지막 라운드 발행 허용 단계 (docs/100.최종룰_차이_결정사항.md D4)
-- 관리자가 기존 5단계 중 여러 개를 고른다. 기본값 = 라이프 제출 (룰의 "리더 협의 뒤"). 마지막 라운드가 시작되면 고정
ALTER TABLE game ADD COLUMN last_issue_phases TEXT NOT NULL DEFAULT '["life"]';
