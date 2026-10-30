/**
 * 기본 룰 파일 (server/rules/*.md, docs/98 §6).
 * - common.md         = 전체 룰 본문 (제목은 DB 값을 그대로 둔다)
 * - team-<code>.md    = 팀 룰. groups.code 기준(white/yellow/blue/red). 파일이 없는 팀(추가 팀 t5 등)은 건너뛴다
 * - loadDefaultRules()           : 관리자 "기본 룰 불러오기". 현재 내용은 updateDocument 가 previous_markdown 에 보관한다
 * - seedDefaultRulesIfPristine() : 기동 시 전체 룰이 초기 문구이고 팀 룰이 모두 비어 있으면 자동 적재 (편집한 DB 는 건드리지 않음)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GLOBAL_RULES_SLUG, getDocument, listTeamRules, updateDocument } from './documents.js'
import { listGroups } from './users.js'
import type { DocumentInfo } from '../../../shared/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 0003 마이그레이션이 넣는 초기 전체 룰 본문 */
const PRISTINE_GLOBAL = '# 게임 룰\n\n진행자가 작성 중입니다.'

/** src/db 와 dist/db 모두 server/rules 를 가리킨다 */
function rulesDir(): string | null {
  const candidates = [path.resolve(__dirname, '../../rules'), path.resolve(__dirname, '../rules')]
  return candidates.find((d) => fs.existsSync(d)) ?? null
}

function readRuleFile(name: string): string | null {
  const dir = rulesDir()
  if (!dir) return null
  const file = path.join(dir, name)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim() : null
}

export interface LoadDefaultRulesResult {
  /** 파일 내용으로 바꾼 문서 (내용이 같아도 포함) */
  loaded: DocumentInfo[]
  /** 내용이 실제로 바뀐 문서 (갱신 알림 대상) */
  changed: DocumentInfo[]
  /** 파일이 없어 건너뛴 팀 이름 */
  skipped: string[]
}

export function loadDefaultRules(userId: number | null): LoadDefaultRulesResult {
  const result: LoadDefaultRulesResult = { loaded: [], changed: [], skipped: [] }
  const common = readRuleFile('common.md')
  if (common == null) throw new Error('기본 룰 파일(common.md)을 찾을 수 없습니다')

  const global = getDocument(GLOBAL_RULES_SLUG)!
  const updatedGlobal = updateDocument(GLOBAL_RULES_SLUG, { title: global.title, markdown: common }, userId)!
  result.loaded.push(updatedGlobal)
  if (global.markdown !== common) result.changed.push(updatedGlobal)

  const teamRules = listTeamRules()
  for (const g of listGroups()) {
    const md = readRuleFile(`team-${g.code}.md`)
    if (md == null) {
      result.skipped.push(g.name)
      continue
    }
    const current = teamRules.find((t) => t.teamId === g.id)
    if (!current) continue
    const updated = updateDocument(current.slug, { title: '', markdown: md }, userId)!
    result.loaded.push(updated)
    if (current.markdown !== md) result.changed.push(updated)
  }
  return result
}

/** 아직 아무도 룰을 쓰지 않은 DB 인지 (전체 룰 = 초기 문구 또는 빈 문서, 팀 룰 모두 빈 문서) */
export function isRulesPristine(): boolean {
  const global = getDocument(GLOBAL_RULES_SLUG)
  if (!global) return false
  const g = global.markdown.trim()
  if (g !== '' && g !== PRISTINE_GLOBAL) return false
  return listTeamRules().every((t) => t.markdown.trim() === '')
}

export function seedDefaultRulesIfPristine(): boolean {
  if (!isRulesPristine()) return false
  if (readRuleFile('common.md') == null) {
    console.warn('[rules] 기본 룰 파일(server/rules/common.md)이 없어 자동 적재를 건너뜁니다')
    return false
  }
  const r = loadDefaultRules(null)
  console.log(`[rules] 기본 룰 자동 적재: ${r.loaded.length}건${r.skipped.length ? ` (파일 없는 팀: ${r.skipped.join(', ')})` : ''}`)
  return true
}
