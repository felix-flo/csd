-- 전쟁 제재 금지 (2026-11-03): 1 이면 리더 협의 안건에서 "다음 라운드 전쟁 제재" 를 뺀다 (전쟁은 항상 허용).
-- 0(기본)이면 기존대로 안건에 있고, 리더 3명 이상이 제재에 찬성하면(오프라인) 관리자가 다음 라운드 전쟁 금지를 건다
ALTER TABLE game ADD COLUMN war_sanction_off INTEGER NOT NULL DEFAULT 0;
