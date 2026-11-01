// Dev-only SQL runner for `nuxt dev` in a normal browser. In the desktop app the same named queries run in Rust
// (src-tauri/src/db.rs). Both read data/queries/*.sql, so there is one copy of every query.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
let db: DatabaseSync | null = null

function open() {
  if (db) return db
  const path = process.env.PELLIKAN_DB ?? resolve(ROOT, 'data/build/bible.db')
  if (!existsSync(path)) {
    throw createError({ statusCode: 503, statusMessage: 'bible.db not found. Run `npm run data` first.' })
  }
  db = new DatabaseSync(path, { readOnly: true })
  return db
}

export function runNamedQuery(name: string, params: Record<string, unknown>) {
  if (!/^[a-z_]+$/.test(name)) throw createError({ statusCode: 400, statusMessage: 'Bad query name' })
  const file = resolve(ROOT, 'data/queries', name + '.sql')
  if (!existsSync(file)) throw createError({ statusCode: 404, statusMessage: `Unknown query "${name}"` })
  const sql = readFileSync(file, 'utf8')

  // Bind exactly the :names the SQL uses; fail loudly if one is missing instead of binding NULL.
  const wanted = [...new Set([...sql.replace(/--.*$/gm, '').matchAll(/:([a-z_]+)/g)].map((m) => m[1]))]
  const bound: Record<string, string | number | null> = {}
  for (const k of wanted) {
    const v = params[k]
    if (v === undefined) throw createError({ statusCode: 400, statusMessage: `Missing parameter "${k}"` })
    if (typeof v !== 'string' && typeof v !== 'number' && v !== null) {
      throw createError({ statusCode: 400, statusMessage: `Parameter "${k}" must be a string or number` })
    }
    bound[k] = v
  }
  return open().prepare(sql).all(bound)
}
