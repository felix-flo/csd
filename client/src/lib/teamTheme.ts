/**
 * 참가자 게임 화면의 팀 색 (docs/107). 색은 팀 code 로 고른다 (팀 이름·색 값을 바꿔도 code 는 그대로).
 * 레드 배경은 흰 글자 대비 4.5:1 을 맞추려고 팀 색 #e5484d 보다 어둡게 쓴다.
 * 그 밖의 팀(직접 추가한 팀)은 팀 색의 밝기로 글자색을 정한다.
 */
import type { GroupInfo } from '../../../shared/types'

interface TeamTheme {
  team: string
  onTeam: string
  /** 알림 개수 숫자 색 (바탕은 onTeam) */
  badgeFg: string
  accent: string
  accentFg: string
  line: string
  /** 디지털 시계 색 */
  led: string
  /** 단계 바의 종료 칸 */
  done: string
  name: string
}

const THEMES: Record<string, TeamTheme> = {
  white: { team: '#f2f3f5', onTeam: '#101216', badgeFg: '#ffffff', accent: '#ffffff', accentFg: '#101216', line: '#ffffff', led: '#ffffff', done: '#5c5f66', name: 'linear-gradient(95deg, #101216 0%, #2f3a52 55%, #6b4fa0 100%)' },
  yellow: { team: '#f5c518', onTeam: '#101216', badgeFg: '#f5c518', accent: '#f5c518', accentFg: '#101216', line: '#f5c518', led: '#f5c518', done: '#6b5a14', name: 'linear-gradient(95deg, #101216 0%, #5a2a00 60%, #b03000 100%)' },
  blue: { team: '#006bff', onTeam: '#ffffff', badgeFg: '#0052c4', accent: '#006bff', accentFg: '#ffffff', line: '#5b9cff', led: '#8fbeff', done: '#0f3a78', name: 'linear-gradient(95deg, #ffffff 0%, #d9f0ff 50%, #7dffe0 100%)' },
  red: { team: '#cf2a30', onTeam: '#ffffff', badgeFg: '#a81c22', accent: '#d9363c', accentFg: '#ffffff', line: '#ff6b6b', led: '#ff9a9a', done: '#6d2428', name: 'linear-gradient(95deg, #ffffff 0%, #ffe9c7 55%, #ffd23f 100%)' },
}

function fromColor(color: string): TeamTheme {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  const n = m ? parseInt(m[1]!, 16) : 0x888888
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  const ink = lum > 0.6 ? '#101216' : '#ffffff'
  return { team: color, onTeam: ink, badgeFg: color, accent: color, accentFg: ink, line: color, led: color, done: '#5c5f66', name: `linear-gradient(95deg, ${ink}, ${ink})` }
}

/** 화면 루트에 얹는 CSS 변수 */
export function teamThemeStyle(team: GroupInfo | null | undefined): Record<string, string> {
  const t = (team && THEMES[team.code]) ?? fromColor(team?.color ?? '#888888')
  return {
    '--team': t.team,
    '--on-team': t.onTeam,
    '--badge-fg': t.badgeFg,
    '--accent': t.accent,
    '--accent-fg': t.accentFg,
    '--team-line': t.line,
    '--led': t.led,
    '--done': t.done,
    '--name': t.name,
  }
}

/** 알림·띠에 쓰는 짧은 팀 이름 ("화이트 팀" → "화이트") */
export function shortTeamName(name: string | null | undefined): string {
  return (name ?? '').replace(/\s*팀$/, '')
}
