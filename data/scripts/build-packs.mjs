#!/usr/bin/env node
// Builds the downloadable translation packs for the translations marked `bundled: false` in translations.mjs.
//
//   npm run data:fetch -- --packs    (once: downloads the source zips from ebible.org and caches them)
//   npm run data:packs
//
// Output in data/build/packs/: <ID>.db.gz for each translation and manifest.json. Publish that folder to wherever the
// app's manifest URL points (see src-tauri/src/packs.rs). The app downloads from there, never from ebible.org.
//
// A pack is a SQLite file with the same schema as bible.db that holds one translation, so the app runs the same named
// queries against it. Nothing in this script talks to the network.

import { DatabaseSync } from 'node:sqlite'
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { BOOKS } from '../../shared/books.ts'
import { loadWeb } from './loaders/web.mjs'
import { TRANSLATIONS } from './translations.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SRC = ROOT + 'sources/'
const OUT_DIR = ROOT + 'build/packs/'
const log = (msg) => console.log('  ' + msg)

const lock = JSON.parse(await readFile(SRC + 'SOURCES.lock.json', 'utf8'))
const edition = `fetched ${lock.fetchedAt.slice(0, 10)}`

// The canonical scheme is the KJV in the main database. A pack whose chapters differ is refused.
let canon = null
try {
  const main = new DatabaseSync(ROOT + 'build/bible.db', { readOnly: true })
  canon = new Map(main.prepare('SELECT id, chapters FROM books').all().map((r) => [r.id, r.chapters]))
  main.close()
} catch {
  console.warn('  (data/build/bible.db not found: skipping the check against the canonical chapter structure)')
}

await mkdir(OUT_DIR, { recursive: true })
const manifest = { version: 1, generatedAt: new Date().toISOString(), packs: [] }

for (const t of TRANSLATIONS.filter((t) => !t.bundled)) {
  const zipPath = `${SRC}translations/${t.ebible}_usfm.zip`
  try {
    await stat(zipPath)
  } catch {
    console.error(`Missing ${zipPath}. Run: npm run data:fetch -- --packs`)
    process.exit(1)
  }
  const dbPath = `${OUT_DIR}${t.id}.db`
  for (const suffix of ['', '-wal', '-shm', '-journal']) await rm(dbPath + suffix, { force: true })

  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA foreign_keys = ON;')
  db.exec(await readFile(ROOT + 'schema/bible.sql', 'utf8'))
  db.prepare('INSERT INTO sources (id, name, kind, language, license, license_url, attribution, source_url, edition) VALUES (?,?,?,?,?,?,?,?,?)').run(
    t.id, t.name, 'translation', 'en', 'Public Domain', t.license_url, t.attribution, `https://ebible.org/Scriptures/${t.ebible}_usfm.zip`, edition,
  )
  const insBook = db.prepare('INSERT INTO books (id, osis, usfm, name, testament, chapters) VALUES (?,?,?,?,?,0)')
  for (const b of BOOKS) insBook.run(b.id, b.osis, b.usfm, b.name, b.testament)

  const r = await loadWeb(db, { zipPath, sourceId: t.id, fileId: t.ebible, log })
  const setChapters = db.prepare('UPDATE books SET chapters = ? WHERE id = ?')
  for (const b of BOOKS) {
    const n = r.chapters.get(b.id)
    if (canon && n !== canon.get(b.id)) throw new Error(`${t.id} has ${n ?? 0} chapters for ${b.name}; the canonical scheme has ${canon.get(b.id)}. It needs a versification mapping before it can be a pack.`)
    setChapters.run(n ?? 0, b.id)
  }
  db.exec("INSERT INTO verses_fts (verses_fts) VALUES ('rebuild')")
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('pack_format', '1')
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('built_at', new Date().toISOString())
  db.exec('PRAGMA user_version = 2; ANALYZE')
  db.close()
  const v = new DatabaseSync(dbPath)
  v.exec('VACUUM')
  v.close()

  const gz = gzipSync(await readFile(dbPath), { level: 9 })
  await writeFile(`${OUT_DIR}${t.id}.db.gz`, gz)
  await rm(dbPath)
  manifest.packs.push({ id: t.id, name: t.name, bytes: gz.length, sha256: createHash('sha256').update(gz).digest('hex'), url: `${t.id}.db.gz` })
  log(`${t.id}: ${(gz.length / 1e6).toFixed(1)} MB compressed`)
}

await writeFile(OUT_DIR + 'manifest.json', JSON.stringify(manifest, null, 2) + '\n')
console.log(`Wrote ${manifest.packs.length} pack(s) and manifest.json to data/build/packs/`)
