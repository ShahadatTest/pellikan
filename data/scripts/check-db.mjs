#!/usr/bin/env node
// Sanity checks on a built data/build/bible.db. Exits non-zero if anything is off.
//
//   npm run data:check

import { DatabaseSync } from 'node:sqlite'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { toFtsQuery } from '../../shared/text.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const db = new DatabaseSync(ROOT + 'build/bible.db', { readOnly: true })

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`)
}
const one = (sql, ...p) => db.prepare(sql).get(...p)
const count = (sql, ...p) => Object.values(one(sql, ...p))[0]

check('integrity_check', one('PRAGMA integrity_check').integrity_check === 'ok')
check('foreign_key_check is empty', db.prepare('PRAGMA foreign_key_check').all().length === 0)
check('schema version', one('PRAGMA user_version').user_version === 1)

// Known totals for these exact editions.
check('66 books', count('SELECT count(*) FROM books') === 66)
check('every book has chapters', count('SELECT count(*) FROM books WHERE chapters < 1') === 0)
check('WEB has 31,103 verses', count("SELECT count(*) FROM verses WHERE translation_id='WEB'") === 31103)
check('Greek NT is 137,554 words', count("SELECT count(*) FROM words WHERE lang='grc'") === 137554)
check('Hebrew/Aramaic words > 300,000', count("SELECT count(*) FROM words WHERE lang IN ('heb','arc')") > 300000)
check('OT has 929 chapters, NT 260', count("SELECT sum(chapters) FROM books WHERE testament='OT'") === 929 && count("SELECT sum(chapters) FROM books WHERE testament='NT'") === 260)

// Every verse token list must reproduce the plain text.
let badTokens = 0
for (const v of db.prepare('SELECT text, tokens FROM verses').iterate()) {
  if (JSON.parse(v.tokens).map((t) => t[0]).join('') !== v.text) badTokens++
}
check('verse tokens join back to text', badTokens === 0, badTokens ? `${badTokens} mismatches` : '')

// Each original-language verse (English numbering) should exist in the English text, except psalm titles (verse 0).
const orphans = count(`
  SELECT count(*) FROM (
    SELECT DISTINCT w.book_id, w.eng_chapter, w.eng_verse FROM words w
    WHERE w.eng_verse > 0 AND NOT EXISTS (
      SELECT 1 FROM verses v WHERE v.book_id = w.book_id AND v.chapter = w.eng_chapter AND v.verse = w.eng_verse)
  )`)
check('every original-language verse exists in WEB', orphans === 0, orphans ? `${orphans} unmatched (listing below)` : '')
if (orphans) {
  for (const r of db.prepare(`
    SELECT DISTINCT b.osis, w.eng_chapter c, w.eng_verse v FROM words w JOIN books b ON b.id = w.book_id
    WHERE w.eng_verse > 0 AND NOT EXISTS (SELECT 1 FROM verses x WHERE x.book_id = w.book_id AND x.chapter = w.eng_chapter AND x.verse = w.eng_verse)
    ORDER BY w.book_id, c, v LIMIT 15`).all()) console.log(`       ${r.osis} ${r.c}:${r.v}`)
}
// ...and the reverse, ignoring verses WEB has that the source text lacks (textual-critical omissions are expected in Greek).
const noOriginal = db.prepare(`
  SELECT b.osis, v.chapter c, v.verse n FROM verses v JOIN books b ON b.id = v.book_id
  WHERE NOT EXISTS (SELECT 1 FROM words w WHERE w.book_id = v.book_id AND w.eng_chapter = v.chapter AND w.eng_verse = v.verse)
  ORDER BY v.book_id, c, n`).all()
console.log(`info ${noOriginal.length} WEB verses have no original-language words (expected for NT verses SBLGNT omits, and the 7 partial-mapping verses)`)
if (noOriginal.length <= 40) console.log('       ' + noOriginal.map((r) => `${r.osis} ${r.c}:${r.n}`).join(', '))

// Stronger than "exists": every OT chapter must END on the same verse number in the Hebrew and in the WEB.
// (Catches a shifted map that an existence check cannot, e.g. a verse silently aligned to its neighbor.)
const shifted = db.prepare(`
  SELECT b.osis, c.ch, (SELECT max(verse) FROM verses v WHERE v.book_id = b.id AND v.chapter = c.ch) AS web,
         (SELECT max(eng_verse) FROM words w WHERE w.book_id = b.id AND w.eng_chapter = c.ch AND w.lang IN ('heb','arc')) AS heb
  FROM books b JOIN (SELECT DISTINCT book_id, eng_chapter AS ch FROM words WHERE lang IN ('heb','arc')) c ON c.book_id = b.id
  WHERE web IS NOT heb`).all()
check('OT chapters end on the same verse in Hebrew and WEB', shifted.length === 0, shifted.map((r) => `${r.osis} ${r.ch} (web ${r.web}, heb ${r.heb})`).join(', '))

// Spot checks that would expose a mis-aligned book or a bad versification map.
const ps3 = count("SELECT count(*) FROM words WHERE book_id=19 AND eng_chapter=3 AND eng_verse=0")
check('Psalm 3 title is 6 words', ps3 === 6, `got ${ps3}`)
check('Joel 2:28-32 has Hebrew words', count('SELECT count(DISTINCT eng_verse) FROM words WHERE book_id=29 AND eng_chapter=2 AND eng_verse BETWEEN 28 AND 32') === 5)
check('Gen 1:1 first Hebrew word is H7225', one("SELECT strongs FROM words WHERE book_id=1 AND eng_chapter=1 AND eng_verse=1 ORDER BY seq LIMIT 1").strongs === 'H7225')
check('John 1:1 first Greek word', one("SELECT text FROM words WHERE book_id=43 AND eng_chapter=1 AND eng_verse=1 ORDER BY seq LIMIT 1").text === 'Ἐν')
check('2 Cor 13:14 is the grace benediction', /χάρις/.test(one("SELECT group_concat(text,' ') t FROM words WHERE book_id=47 AND eng_chapter=13 AND eng_verse=14").t ?? ''))
check('Rev 13:1 starts with the sand-of-the-sea clause', one("SELECT text FROM words WHERE book_id=66 AND eng_chapter=13 AND eng_verse=1 ORDER BY seq LIMIT 1").text === 'καὶ')
check('lemma λόγος counted', count("SELECT occurrences FROM lemmas WHERE lemma_key='λόγος'") > 300)
check('no qere duplicates counted in lemmas', count("SELECT sum(occurrences) FROM lemmas WHERE lang IN ('heb','arc')") === count("SELECT count(*) FROM words WHERE lang IN ('heb','arc') AND variant IS NOT 'qere'"))

// Search works, and is stemmed.
const q = toFtsQuery('loved world', { prefix: false })
const hits = count("SELECT count(*) FROM verses_fts WHERE verses_fts MATCH ?", q)
check('FTS finds "loved world"', hits > 0, `${hits} hits`)
const jn316 = one("SELECT v.chapter, v.verse FROM verses_fts JOIN verses v ON v.id = verses_fts.rowid WHERE verses_fts MATCH ? AND v.book_id = 43 ORDER BY rank LIMIT 1", toFtsQuery('God so loved the world', { prefix: false }))
check('FTS ranks John 3:16 first for its own wording', jn316?.chapter === 3 && jn316?.verse === 16, jn316 ? `${jn316.chapter}:${jn316.verse}` : 'none')

// Every shared query file must at least prepare against this schema, and user.sql must apply to an empty DB.
const qdir = ROOT + 'queries/'
for (const f of (await readdir(qdir)).filter((n) => n.endsWith('.sql'))) {
  try {
    db.prepare(await readFile(qdir + f, 'utf8'))
    check(`query ${f} prepares`, true)
  } catch (err) {
    check(`query ${f} prepares`, false, err.message)
  }
}
// The Rust side only runs queries listed in src-tauri/src/db.rs. A query file missing from that list works in
// `nuxt dev` and then fails inside the desktop app, so compare the two lists.
{
  const rs = await readFile(ROOT + '../src-tauri/src/db.rs', 'utf8')
  const registered = [...rs.matchAll(/^\s*q!\("([a-z_]+)"\),/gm)].map((m) => m[1]).sort()
  const files = (await readdir(qdir)).filter((n) => n.endsWith('.sql')).map((n) => n.slice(0, -4)).sort()
  const missing = files.filter((f) => !registered.includes(f))
  const stale = registered.filter((r) => !files.includes(r))
  check('every query file is registered in src-tauri/src/db.rs', !missing.length && !stale.length,
    [missing.length && `unregistered: ${missing}`, stale.length && `no file: ${stale}`].filter(Boolean).join('; '))
}
try {
  const u = new DatabaseSync(':memory:')
  u.exec('PRAGMA foreign_keys = ON')
  const sql = await readFile(ROOT + 'schema/user.sql', 'utf8')
  u.exec(sql)
  u.exec(sql) // must be idempotent: the app runs it on every launch
  check('user.sql applies twice cleanly', true)
} catch (err) {
  check('user.sql applies twice cleanly', false, err.message)
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
