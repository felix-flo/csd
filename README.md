# CSD

오프라인 게임 진행 시스템 (Vue 3 + Express 5 + SQLite + Socket.IO).

- 설계/배포 문서: [docs/90.개발환경초안.md](docs/90.개발환경초안.md)
- 그룹별 재화 미결 사항: [docs/91.그룹별재화_미결사항.md](docs/91.그룹별재화_미결사항.md)
- DB 파일 위치 / DataGrip · sqlite3 CLI 접속 / 알림 초기화: [docs/92.DB접속_운영.md](docs/92.DB접속_운영.md)
- 팀 구성 변경 계획 (고정 4팀·팀 색·팀 이동): [docs/94.팀구성_변경계획.md](docs/94.팀구성_변경계획.md)
- 로컬 개발: `npm install && npm run dev` → http://localhost:5173
- 라즈베리파이 배포: `PI_HOST=pi@<host> ./deploy.sh`
- 개발용 PIN (대소문자 구분 없음): `ADMN`(관리자) `SHOW`(프레젠테이션) `WLDR`/`WMEM` `YLDR`/`YMEM` `BLDR`/`BMEM` `RLDR`/`RMEM`(화이트/옐로우/블루/레드 팀 리더/테스트유저)
