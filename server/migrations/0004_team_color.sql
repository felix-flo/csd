-- 팀 색 (#rrggbb). 기존 A~D 그룹은 기본 4팀(화이트/옐로우/블루/레드)으로 순서 매핑한다.
-- 참가자 소속(group_id)은 그대로 유지된다. 5번째 이후 그룹은 서버 기동 시 ensureTeams() 가
-- 소속 참가자를 인원 적은 팀으로 옮긴 뒤 삭제한다 (docs/94.팀구성_변경계획.md).
ALTER TABLE groups ADD COLUMN team_color TEXT NOT NULL DEFAULT '#888888';

UPDATE groups SET code = 'white',  name = '화이트 팀', team_color = '#ffffff' WHERE code = 'a';
UPDATE groups SET code = 'yellow', name = '옐로우 팀', team_color = '#f5c518' WHERE code = 'b';
UPDATE groups SET code = 'blue',   name = '블루 팀',   team_color = '#006bff' WHERE code = 'c';
UPDATE groups SET code = 'red',    name = '레드 팀',   team_color = '#e5484d' WHERE code = 'd';
