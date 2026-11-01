// Easton's and Smith's Bible dictionaries, read from CrossWire SWORD modules (public domain).

import { openModule, readRawLD, readZLD } from './sword.mjs'
import { markupToText, titleCase, decodeEntities } from './markup.mjs'

const foldKey = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Pure: raw SWORD entries -> dictionary rows. Exported for tests. */
export function toDictionaryRows(entries, { properName = null } = {}) {
  const rows = []
  const seen = new Map()
  for (const e of entries) {
    if (!e.key) continue
    let headword = properName?.(e) ?? titleCase(e.key)
    let body = markupToText(e.body)
    // Easton/Smith start the body with the headword as a <title>; the headword is stored separately.
    if (body.toLowerCase().startsWith(headword.toLowerCase() + '\n')) body = body.slice(headword.length + 1)
    if (!body) continue
    const n = (seen.get(headword) ?? 0) + 1
    seen.set(headword, n)
    if (n > 1) headword += ` (${n})`
    rows.push({ headword, headword_norm: foldKey(headword), body })
  }
  return rows
}

export async function loadDictionary(db, { zipPath, sourceId, log = () => {} }) {
  const mod = await openModule(zipPath)
  const entries = mod.driver === 'zLD' ? readZLD(mod) : readRawLD(mod)
  const rows = toDictionaryRows(entries, {
    properName: (e) => {
      const n = /<entryFree\b[^>]*\bn="([^"]+)"/.exec(e.body)
      return n ? decodeEntities(n[1]) : null
    },
  })
  const ins = db.prepare('INSERT INTO dictionary_entries (source_id, headword, headword_norm, body) VALUES (?,?,?,?)')
  db.exec('BEGIN')
  try {
    for (const r of rows) ins.run(sourceId, r.headword, r.headword_norm, r.body)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  log(`${sourceId}: ${rows.length} entries (SWORD ${mod.driver}, ${mod.license}, v${mod.version})`)
  return { entries: rows.length }
}
