-- 테스트 모드 (탭 로그인, docs/101.테스트모드_탭로그인.md)
-- 켜면 로그인 때 리프레시 쿠키를 심지 않아 탭마다 따로 로그인한다 (관리자가 한 기기에서 여러 계정으로 테스트할 때)
ALTER TABLE game ADD COLUMN tab_login INTEGER NOT NULL DEFAULT 0;
