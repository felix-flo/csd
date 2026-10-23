-- 마지막 로그인 시각. 준비 상태의 "참가자 PIN" 카드에서 PIN 을 받고 접속했는지(접속함) 보여주는 데 쓴다
ALTER TABLE users ADD COLUMN last_login_at TEXT;
