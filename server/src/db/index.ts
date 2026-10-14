import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })

export const db = new Database(config.dbPath)
// 서버 재시작/전원 차단에도 데이터 보존 + 동시 읽기 성능을 위해 WAL 사용
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')

/** migrations/*.sql 을 파일명 순서대로 1회씩 적용 */
export function runMigrations() {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
  // dist/index.js(번들) 와 src/db/index.ts 양쪽에서 동작하도록 두 위치를 탐색
  const candidates = [
    path.resolve(__dirname, '../migrations'),
    path.resolve(__dirname, '../../migrations'),
  ]
  const dir = candidates.find((d) => fs.existsSync(d))
  if (!dir) throw new Error(`migrations 폴더를 찾을 수 없습니다: ${candidates.join(', ')}`)

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  )
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const insert = db.prepare('INSERT INTO _migrations (name) VALUES (?)')
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      insert.run(file)
    })()
    console.log(`[db] migration applied: ${file}`)
  }
}
