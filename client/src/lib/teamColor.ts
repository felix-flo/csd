/**
 * 팀 색을 글자·테두리에 쓸 때의 강조색. 화이트 팀처럼 아주 밝은 색은 흰 배경에서 보이지 않으므로 진한 회색으로 바꾼다.
 * (팀 색 점(TeamMark)은 그대로 팀 색을 쓴다)
 */
export function teamInk(color: string | null | undefined): string | null {
  if (!color) return null
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const n = parseInt(m[1]!, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.82 ? '#555' : color
}
