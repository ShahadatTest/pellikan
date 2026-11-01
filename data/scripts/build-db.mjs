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
import { loadLexicons } from './loaders/lexicon.mjs'
import { loadDictionary } from './loaders/dictionary.mjs'
import { loadCommentary } from './loaders/commentary.mjs'
import { loadTsk, loadOpenBible } from './loaders/crossrefs.mjs'
import { TRANSLATIONS } from './translations.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SRC = ROOT + 'sources/'
const OUT_DIR = ROOT + 'build/'
const OUT = OUT_DIR + 'bible.db'
const SCHEMA_VERSION = 2

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

// Bundled translations beyond the WEB (see translations.mjs). The non-bundled ones are downloaded by the app on demand.
const EXTRA_TRANSLATIONS = TRANSLATIONS.filter((t) => t.bundled).map((t) => ({
  id: t.id,
  name: t.name,
  kind: 'translation',
  language: 'en',
  license: 'Public Domain',
  license_url: t.license_url,
  attribution: t.attribution,
  source_url: `https://ebible.org/Scriptures/${t.ebible}_usfm.zip`,
}))

const CROSSWIRE = 'https://crosswire.org/sword/modules/ModInfo.jsp?modName='
const REFERENCE_SOURCES = [
  {
    id: 'STRONGS_H', name: "Strong's Hebrew Dictionary (Open Scriptures Hebrew Lexicon)", kind: 'lexicon', language: 'he',
    license: "Strong's text: public domain. Open Scriptures encoding: CC BY 4.0",
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: "Strong's Exhaustive Concordance (1890), Hebrew dictionary, as encoded by the Open Scriptures Hebrew Lexicon (hb.openscriptures.org), CC BY 4.0. Credit: the Open Scriptures Hebrew Bible Project.",
    source_url: 'https://github.com/openscriptures/HebrewLexicon',
  },
  {
    id: 'BDB', name: 'Brown-Driver-Briggs Hebrew and English Lexicon', kind: 'lexicon', language: 'he',
    license: 'BDB text: public domain. Open Scriptures encoding and lexical index: CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Brown, Driver and Briggs, A Hebrew and English Lexicon of the Old Testament (1906), as encoded by the Open Scriptures Hebrew Lexicon (hb.openscriptures.org), CC BY 4.0. Credit: the Open Scriptures Hebrew Bible Project. The encoding is a work in progress and some entries are incomplete.',
    source_url: 'https://github.com/openscriptures/HebrewLexicon',
  },
  {
    id: 'STRONGS_G', name: "Strong's Greek Dictionary", kind: 'lexicon', language: 'grc',
    license: "Strong's text: public domain. Open Scriptures JSON of Ulrik Petersen's XML: CC BY-SA",
    license_url: 'https://creativecommons.org/licenses/by-sa/3.0/',
    attribution: "Dictionary of Greek Words from Strong's Exhaustive Concordance (1890). XML by Ulrik Petersen (ulrikp.org); JSON by Open Scriptures, CC BY-SA.",
    source_url: 'https://github.com/openscriptures/strongs',
  },
  {
    id: 'THAYER', name: "Thayer's Greek-English Lexicon of the New Testament", kind: 'lexicon', language: 'grc',
    license: 'Public domain (1889). Digitization released under CC0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: "Joseph Henry Thayer, A Greek-English Lexicon of the New Testament (1889). Digitized dataset by nigelmsipa (github.com/nigelmsipa/thayers-greek-lexicon-dataset), produced with automated OCR: expect transcription errors, especially in Hebrew, Syriac and abbreviation-heavy passages.",
    source_url: 'https://github.com/nigelmsipa/thayers-greek-lexicon-dataset',
  },
  {
    id: 'EASTON', name: "Easton's Bible Dictionary", kind: 'dictionary', language: 'en',
    license: 'Public Domain', license_url: CROSSWIRE + 'Easton',
    attribution: "M. G. Easton, Illustrated Bible Dictionary, third edition (Thomas Nelson, 1897). Text via the CrossWire Bible Society's Easton module (from CCEL).",
    source_url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Easton.zip',
  },
  {
    id: 'SMITH', name: "Smith's Bible Dictionary", kind: 'dictionary', language: 'en',
    license: 'Public Domain', license_url: CROSSWIRE + 'Smith',
    attribution: "William Smith, Smith's Bible Dictionary (1884). Text via the CrossWire Bible Society's Smith module.",
    source_url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Smith.zip',
  },
  {
    id: 'MHC', name: "Matthew Henry's Commentary on the Whole Bible", kind: 'commentary', language: 'en',
    license: 'Public Domain', license_url: CROSSWIRE + 'MHC',
    attribution: "Matthew Henry, An Exposition of the Old and New Testaments (1706-1721). Text via the CrossWire Bible Society's MHC module. The quoted Bible text in the source was removed.",
    source_url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/MHC.zip',
  },
  {
    id: 'TSK', name: 'Treasury of Scripture Knowledge', kind: 'cross-references', language: 'en',
    license: 'Public Domain', license_url: CROSSWIRE + 'TSK',
    attribution: "R. A. Torrey (ed.), The Treasury of Scripture Knowledge (c. 1880). Text via the CrossWire Bible Society's TSK module. References were parsed from the TSK's abbreviated notation by Pellikan and can contain errors.",
    source_url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/TSK.zip',
  },
  {
    id: 'OPENBIBLE', name: 'OpenBible.info Cross References', kind: 'cross-references', language: 'en',
    license: 'CC BY (Creative Commons Attribution)', license_url: 'https://www.openbible.info/labs/cross-references/',
    attribution: 'Cross reference data from OpenBible.info (openbible.info/labs/cross-references), Creative Commons Attribution. Votes are from the OpenBible.info community. Only references with at least one positive vote are included.',
    source_url: 'https://a.openbible.info/data/cross-references.zip',
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
  // `--no-esv` is for release builds: the installer bundles data/build/bible.db, and the ESV must never ship in it.
  const hasEsv = !process.argv.includes('--no-esv') && (await fileExists(ESV_EPUB))
  if (!hasEsv) console.log(process.argv.includes('--no-esv') ? '  (--no-esv: building without the ESV)' : '  (no ESV epub in data/sources/esv/, building without it)')
  for (const s of [...SOURCES, ...EXTRA_TRANSLATIONS, ...REFERENCE_SOURCES, ...(hasEsv ? [ESV_SOURCE] : [])]) {
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

  // Canonical scheme: English (KJV) chapter and verse numbering with the 66 OSIS book ids. The KJV is the reference
  // versification (the TSK and Matthew Henry are indexed by it); the WEB and every other translation are checked
  // against it. A translation that numbers differently needs a mapping table before it can be added.
  const bundled = [{ id: 'WEB', chapters: web.chapters }]
  for (const t of TRANSLATIONS.filter((t) => t.bundled)) {
    const r = await loadWeb(db, { zipPath: `${SRC}translations/${t.ebible}_usfm.zip`, sourceId: t.id, fileId: t.ebible, log })
    bundled.push({ id: t.id, chapters: r.chapters })
  }
  for (const t of bundled) {
    for (const b of BOOKS) {
      if (t.chapters.get(b.id) !== web.chapters.get(b.id)) throw new Error(`${t.id} has ${t.chapters.get(b.id) ?? 0} chapters for ${b.name}, the WEB has ${web.chapters.get(b.id)}`)
    }
  }
  const verseCounts = (id) => new Map(db.prepare('SELECT book_id || \':\' || chapter AS k, max(verse) AS n FROM verses WHERE translation_id = ? GROUP BY book_id, chapter').all(id).map((r) => [r.k, r.n]))
  const canon = verseCounts('KJV')
  for (const t of bundled) {
    if (t.id === 'KJV') continue
    const mine = verseCounts(t.id)
    const diff = [...canon].filter(([k, n]) => mine.get(k) !== n).map(([k, n]) => `${BOOKS[+k.split(':')[0] - 1].osis} ${k.split(':')[1]} (KJV ${n}, ${t.id} ${mine.get(k)})`)
    if (diff.length) log(`${t.id}: last verse differs from the KJV in ${diff.length} chapter(s): ${diff.slice(0, 6).join('; ')}${diff.length > 6 ? '; ...' : ''}`)
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

  await loadLexicons(db, {
    hebrewDir: SRC + 'hebrew-lexicon/',
    greekJs: SRC + 'strongs/strongs-greek-dictionary.js',
    thayerJsonl: SRC + 'thayer/thayer_lexicon.jsonl',
    ids: { strongsH: 'STRONGS_H', bdb: 'BDB', strongsG: 'STRONGS_G', thayer: 'THAYER' },
    log,
  })
  await loadDictionary(db, { zipPath: SRC + 'sword/Easton.zip', sourceId: 'EASTON', log })
  await loadDictionary(db, { zipPath: SRC + 'sword/Smith.zip', sourceId: 'SMITH', log })

  // Versification shape of the KJV, which SWORD modules and OpenBible are indexed by.
  const shape = { ot: [], nt: [] }
  const lastVerseOf = new Map()
  for (const r of db.prepare("SELECT book_id, chapter, max(verse) AS n FROM verses WHERE translation_id = 'KJV' GROUP BY book_id, chapter ORDER BY book_id, chapter").all()) {
    const t = r.book_id <= 39 ? shape.ot : shape.nt
    const idx = r.book_id <= 39 ? r.book_id - 1 : r.book_id - 40
    ;(t[idx] ??= [])[r.chapter - 1] = r.n
    lastVerseOf.set(r.book_id * 1000 + r.chapter, r.n)
  }
  const lastVerse = (bookId, chapter) => lastVerseOf.get(bookId * 1000 + chapter) ?? 0
  await loadCommentary(db, { zipPath: SRC + 'sword/MHC.zip', sourceId: 'MHC', shape, log })
  await loadTsk(db, { zipPath: SRC + 'sword/TSK.zip', sourceId: 'TSK', shape, lastVerse, log })
  await loadOpenBible(db, { zipPath: SRC + 'openbible/cross-references.zip', sourceId: 'OPENBIBLE', lastVerse, log })

  // One row per lexeme. Qere words duplicate a ketiv word, so they are not counted.
  db.exec(`
    INSERT INTO lemmas (lemma_key, lang, lemma, strongs, occurrences)
    SELECT lemma_key, min(lang), min(lemma), min(strongs), count(*)
    FROM words
    WHERE variant IS NOT 'qere'
    GROUP BY lemma_key
  `)

  db.exec("INSERT INTO verses_fts (verses_fts) VALUES ('rebuild')")
  db.exec("INSERT INTO dictionary_fts (dictionary_fts) VALUES ('rebuild')")
  db.exec('CREATE INDEX cross_ref_to ON cross_references (to_book_id, to_chapter, to_verse)')

  const insMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
  insMeta.run('schema_version', String(SCHEMA_VERSION))
  insMeta.run('built_at', new Date().toISOString())
  insMeta.run('sources_fetched_at', lock.fetchedAt)
  const packZips = new Set(TRANSLATIONS.filter((t) => !t.bundled).map((t) => `translations/${t.ebible}_usfm.zip`))
  for (const [path, f] of Object.entries(lock.files)) {
    if (packZips.has(path)) continue // on-demand translations are not in this database
    insMeta.run('sha256:' + path, f.sha256)
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
