/**
 * 팀 정의 (서버/클라이언트 공용).
 * - 기본 4팀은 서버 기동 시 groups 테이블이 비어 있으면 자동 생성된다 (ensureTeams).
 * - 팀 색은 groups.team_color 에 '#rrggbb' 로 저장한다. 관리자 화면에서는 아래 팔레트에서만 고른다.
 */
export interface TeamDef {
  code: string
  name: string
  color: string
}

export const DEFAULT_TEAMS: readonly TeamDef[] = [
  { code: 'white', name: '화이트 팀', color: '#ffffff' },
  { code: 'yellow', name: '옐로우 팀', color: '#f5c518' },
  { code: 'blue', name: '블루 팀', color: '#006bff' },
  { code: 'red', name: '레드 팀', color: '#e5484d' },
] as const

export interface PaletteColor {
  name: string
  hex: string
}

/** 팀 추가·수정 시 선택할 수 있는 색. 흰 배경에서 서로 구분되는 10색 */
export const TEAM_PALETTE: readonly PaletteColor[] = [
  { name: '화이트', hex: '#ffffff' },
  { name: '옐로우', hex: '#f5c518' },
  { name: '블루', hex: '#006bff' },
  { name: '레드', hex: '#e5484d' },
  { name: '그린', hex: '#2e9e5b' },
  { name: '오렌지', hex: '#f5841f' },
  { name: '퍼플', hex: '#7c3aed' },
  { name: '핑크', hex: '#e85d9b' },
  { name: '틸', hex: '#0e9aa7' },
  { name: '블랙', hex: '#171717' },
] as const

export const HEX_COLOR = /^#[0-9a-f]{6}$/

export function isPaletteColor(hex: string): boolean {
  return TEAM_PALETTE.some((c) => c.hex === hex)
}

/** 밝은 색인지 (흰 배경에서 테두리를 진하게 줄지 판단). YIQ 기준 */
export function isLightColor(hex: string): boolean {
  if (!HEX_COLOR.test(hex)) return false
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 200
}
