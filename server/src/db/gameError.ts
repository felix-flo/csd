/**
 * 게임 규칙 위반. 라우터가 { error: code, detail } 로 응답한다.
 * status 는 기본 409 (상태 충돌). 잘못된 입력은 400, 권한은 403.
 */
export class GameError extends Error {
  constructor(public code: string, public detail = '', public status = 409) {
    super(detail ? `${code}: ${detail}` : code)
  }
}
