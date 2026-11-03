export interface RuleTab {
  title: string
  markdown: string
}

const DIVIDER = /^===\s*(.+?)\s*===\s*$/

/** 룰 마크다운을 "=== 탭 이름 ===" 줄 기준으로 나눈다. 구분자가 없으면 탭 하나. 첫 구분자 앞 내용은 "룰" 탭 */
export function splitRuleTabs(markdown: string): RuleTab[] {
  const tabs: RuleTab[] = []
  let title = '룰'
  let lines: string[] = []
  const flush = () => {
    const body = lines.join('\n').trim()
    if (body) tabs.push({ title, markdown: body })
    lines = []
  }
  for (const line of markdown.split('\n')) {
    const m = DIVIDER.exec(line)
    if (m) {
      flush()
      title = m[1]!
    } else lines.push(line)
  }
  flush()
  return tabs
}
