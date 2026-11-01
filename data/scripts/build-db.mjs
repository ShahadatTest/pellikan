#!/usr/bin/env node
// Builds data/build/bible.db from the files in data/sources/ (run `npm run data:fetch` first).
//
//   npm run data:build
//
// Uses Node's built-in SQLite (node:sqlite), so there is no native module to compile.

import { DatabaseSync } from 'node:sqlite'
import { readFile, mkdir, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { BOOKS } from '../../shared/books.ts'
import { loadWeb } from './loaders/web.mjs'
import { loadEsv } from './loaders/esv.mjs'
import { loadOshb } from './loaders/oshb.mjs'
import { loadMorphGnt } from './loaders/morphgnt.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SRC = ROOT + 'sources/'
const OUT_DIR = ROOT + 'build/'
const OUT = OUT_DIR + 'bible.db'
const SCHEMA_VERSION = 1

const log = (msg) => console.log('  ' + msg)

// License and attribution text lives here so the in-app Credits page is generated from the data.
// Verify these against each upstream before distributing a build (see DATA_SOURCES.md).
const SOURCES = [
  {
    id: 'WEB',
    name: 'World English Bible',
    kind: 'translation',
    language: 'en',
    license: 'Public Domain',
    license_url: 'https://ebible.org/web/',
    attribution:
      'The World English Bible is in the public domain. "World English Bible" is a trademark of eBible.org; modified texts must not use that name.',
    source_url: 'https://ebible.org/Scriptures/eng-web_usfm.zip',
  },
  {
    id: 'OSHB',
    name: 'Open Scriptures Hebrew Bible',
    kind: 'original-text',
    language: 'he',
    license: 'CC BY 4.0 (lemma and morphology); Westminster Leningrad Codex text is public domain',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    attribution:
      'Hebrew text: Westminster Leningrad Codex. Lemmas and morphology: Open Scriptures Hebrew Bible (hb.openscriptures.org), CC BY 4.0.',
    source_url: 'https://github.com/openscriptures/morphhb',
  },
  {
    id: 'SBLGNT',
    name: 'SBL Greek New Testament with MorphGNT tagging',
    kind: 'original-text',
    language: 'grc',
    license: 'SBLGNT text: CC BY 4.0 (verify). MorphGNT morphology and lemmas: CC BY-SA 3.0',
    license_url: 'https://creativecommons.org/licenses/by-sa/3.0/',
    attribution:
      'SBL Greek New Testament, Michael W. Holmes (ed.), Society of Biblical Literature and Logos Bible Software. Morphological tagging: MorphGNT (morphgnt.org), CC BY-SA 3.0.',
    source_url: 'https://github.com/morphgnt/sblgnt',
  },
]

// Optional: only built in when the user supplies the epub (see DATA_SOURCES.md). The notice text is the one
// Crossway's permissions page requires wherever the ESV is quoted.
const ESV_EPUB = SRC + 'esv/esv_classic_reference_bible_4.epub'
const ESV_SOURCE = {
  id: 'ESV',
  name: 'English Standard Version (ESV Classic Reference Bible)',
  kind: 'translation',
  language: 'en',
  license: 'Copyright Crossway. Used by permission. All rights reserved.',
  license_url: 'https://www.esv.org/permissions/',
  attribution:
    'Scripture quotations are from The ESV\u00ae Bible (The Holy Bible, English Standard Version\u00ae), copyright \u00a9 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. Text, section headings, footnotes and cross-references from the ESV Classic Reference Bible ePub (ESV Text Edition: 2016).',
  source_url: 'https://www.crossway.org/bibles/esv-classic-reference-bible-hardcover/',
}

async function fileExists(p) {
  try { await stat(p); return true } catch { return false }
}

async function main() {
  const started = Date.now()
  const lock = JSON.parse(await readFile(SRC + 'SOURCES.lock.json', 'utf8'))

  await mkdir(OUT_DIR, { recursive: true })
  for (const suffix of ['', '-wal', '-shm', '-journal']) await rm(OUT + suffix, { force: true })

  const db = new DatabaseSync(OUT)
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA foreign_keys = ON;')
  db.exec(await readFile(ROOT + 'schema/bible.sql', 'utf8'))

  console.log('Building bible.db')
  const edition = lock.fetchedAt.slice(0, 10)
  const insSource = db.prepare(
    'INSERT INTO sources (id, name, kind, language, license, license_url, attribution, source_url, edition) VALUES (?,?,?,?,?,?,?,?,?)',
  )
  const hasEsv = await fileExists(ESV_EPUB)
  if (!hasEsv) console.log('  (no ESV epub in data/sources/esv/, building without it)')
  for (const s of hasEsv ? [...SOURCES, ESV_SOURCE] : SOURCES) {
    insSource.run(s.id, s.name, s.kind, s.language, s.license, s.license_url, s.attribution, s.source_url, `fetched ${edition}`)
  }

  // Books need a chapter count, which comes from the WEB text, so insert them after loading it.
  // foreign keys are enforced, so create the rows first with 0 and fix them up after.
  const insBook = db.prepare('INSERT INTO books (id, osis, usfm, name, testament, chapters) VALUES (?,?,?,?,?,0)')
  for (const b of BOOKS) insBook.run(b.id, b.osis, b.usfm, b.name, b.testament)

  const web = await loadWeb(db, { zipPath: SRC + 'web/eng-web_usfm.zip', log })
  const setChapters = db.prepare('UPDATE books SET chapters = ? WHERE id = ?')
  for (const b of BOOKS) {
    const n = web.chapters.get(b.id)
    if (!n) throw new Error(`WEB has no text for ${b.name}`)
    setChapters.run(n, b.id)
  }

  if (hasEsv) {
    const esv = await loadEsv(db, { epubPath: ESV_EPUB, log })
    for (const b of BOOKS) {
      const n = esv.chapters.get(b.id)
      if (n !== web.chapters.get(b.id)) throw new Error(`ESV has ${n ?? 0} chapters for ${b.name}, the WEB has ${web.chapters.get(b.id)}`)
    }
  }

  await loadOshb(db, { dir: SRC + 'oshb', log })
  await loadMorphGnt(db, { dir: SRC + 'morphgnt', log })

  // One row per lexeme. Qere words duplicate a ketiv word, so they are not counted.
  db.exec(`
    INSERT INTO lemmas (lemma_key, lang, lemma, strongs, occurrences)
    SELECT lemma_key, min(lang), min(lemma), min(strongs), count(*)
    FROM words
    WHERE variant IS NOT 'qere'
    GROUP BY lemma_key
  `)

  db.exec("INSERT INTO verses_fts (verses_fts) VALUES ('rebuild')")

  const insMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
  insMeta.run('schema_version', String(SCHEMA_VERSION))
  insMeta.run('built_at', new Date().toISOString())
  insMeta.run('sources_fetched_at', lock.fetchedAt)
  for (const [path, f] of Object.entries(lock.files)) {
    if (path.endsWith('.xml') || path.endsWith('.zip') || path.endsWith('.txt')) insMeta.run('sha256:' + path, f.sha256)
  }

  if (hasEsv) insMeta.run('sha256:esv/esv_classic_reference_bible_4.epub', createHash('sha256').update(await readFile(ESV_EPUB)).digest('hex'))

  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  db.exec('ANALYZE')
  db.close()

  // VACUUM needs its own connection with journaling on to reclaim space.
  const v = new DatabaseSync(OUT)
  v.exec('VACUUM')
  v.close()

  const size = (await stat(OUT)).size
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s: ${(size / 1e6).toFixed(1)} MB at data/build/bible.db`)
}

main().catch((err) => {
  console.error('\nBuild failed:', err.message)
  process.exit(1)
})
