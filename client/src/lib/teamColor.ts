/**
 * 팀 색을 글자·테두리에 쓸 때의 강조색. 다크 테마(docs/106)라 아주 어두운 색은 바탕에 묻히므로 밝은 회색으로 바꾼다.
 * (팀 색 점(TeamMark)은 그대로 팀 색을 쓴다)
 */
export function teamInk(color: string | null | undefined): string | null {
  if (!color) return null
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const n = parseInt(m[1]!, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum < 0.2 ? '#b9c0cc' : color
}
