#!/usr/bin/env node
// Downloads the raw source data into data/sources/ (git-ignored) and records a SHA-256 for every file in
// data/sources/SOURCES.lock.json, so a build can say exactly which bytes it was made from.
//
//   npm run data:fetch            download anything missing
//   npm run data:fetch -- --force re-download everything
//   npm run data:fetch -- --packs also download the on-demand translations
//
// Sources and licenses are documented in DATA_SOURCES.md.

import { mkdir, writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { BOOKS, MORPHGNT_FILES } from '../../shared/books.ts'
import { TRANSLATIONS } from './translations.mjs'

const SOURCES_DIR = fileURLToPath(new URL('../sources/', import.meta.url))
const FORCE = process.argv.includes('--force')
// `--packs` also downloads the translations that are NOT bundled (ASV, YLT, Darby), which `npm run data:packs` turns into
// downloadable packs. The default build never needs them.
const PACKS = process.argv.includes('--packs')

// NOTE: these track each project's default branch, so a re-fetch can pull newer upstream data.
// SOURCES.lock.json records what was actually downloaded; pin to commit SHAs here if you need
// byte-for-byte reproducible builds.
const WEB_URL = 'https://ebible.org/Scriptures/eng-web_usfm.zip'
const MORPHGNT = 'https://raw.githubusercontent.com/morphgnt/sblgnt/master/'
const OSHB = 'https://raw.githubusercontent.com/openscriptures/morphhb/master/'

const EBIBLE = 'https://ebible.org/Scriptures/'
const OS_LEXICON = 'https://raw.githubusercontent.com/openscriptures/HebrewLexicon/master/'
const OS_STRONGS = 'https://raw.githubusercontent.com/openscriptures/strongs/master/'
// Thayer's: a single-maintainer, OCR-derived dataset, so it is pinned to the commit that was reviewed.
const THAYER = 'https://raw.githubusercontent.com/nigelmsipa/thayers-greek-lexicon-dataset/e4a42b1cea86c3cb592b3e87c350fac6e9c46b13/data/'
const CROSSWIRE = 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/'

const jobs = [
  ...TRANSLATIONS.filter((t) => t.bundled || PACKS).map((t) => ({ url: `${EBIBLE}${t.ebible}_usfm.zip`, dest: `translations/${t.ebible}_usfm.zip` })),
  ...['HebrewStrong.xml', 'BrownDriverBriggs.xml', 'LexicalIndex.xml', 'readme.md'].map((f) => ({ url: OS_LEXICON + f, dest: `hebrew-lexicon/${f}` })),
  { url: OS_STRONGS + 'greek/strongs-greek-dictionary.js', dest: 'strongs/strongs-greek-dictionary.js' },
  { url: THAYER + 'thayer_lexicon.jsonl', dest: 'thayer/thayer_lexicon.jsonl' },
  { url: 'https://a.openbible.info/data/cross-references.zip', dest: 'openbible/cross-references.zip' },
  ...['Easton', 'Smith', 'TSK', 'MHC'].map((m) => ({ url: `${CROSSWIRE}${m}.zip`, dest: `sword/${m}.zip` })),
  { url: WEB_URL, dest: 'web/eng-web_usfm.zip' },
  ...MORPHGNT_FILES.map((f) => ({ url: MORPHGNT + f, dest: `morphgnt/${f}` })),
  { url: MORPHGNT + 'README.md', dest: 'morphgnt/README.md' },
  ...BOOKS.filter((b) => b.testament === 'OT').map((b) => ({ url: `${OSHB}wlc/${b.osis}.xml`, dest: `oshb/${b.osis}.xml` })),
  { url: OSHB + 'wlc/VerseMap.xml', dest: 'oshb/VerseMap.xml' },
  { url: OSHB + 'LICENSE.md', dest: 'oshb/LICENSE.md' },
]

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function download(url) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      lastError = err
      if (attempt < 3) await new Promise((r) => setTimeout(r, 750 * attempt))
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? lastError}`)
}

const lock = {}
const failures = []
let done = 0

async function run(job) {
  const dest = SOURCES_DIR + job.dest
  try {
    let bytes
    if (!FORCE && (await exists(dest))) {
      const { readFile } = await import('node:fs/promises')
      bytes = await readFile(dest)
    } else {
      bytes = await download(job.url)
      await mkdir(dest.slice(0, dest.lastIndexOf('/')), { recursive: true })
      await writeFile(dest, bytes)
    }
    lock[job.dest] = {
      url: job.url,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    }
  } catch (err) {
    failures.push(err.message)
  }
  done++
  process.stdout.write(`\r  ${done}/${jobs.length} files`)
}

// Small worker pool: polite to the hosts, fast enough.
const queue = [...jobs]
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) await run(queue.shift())
  }),
)
process.stdout.write('\n')

if (failures.length) {
  console.error(`\n${failures.length} download(s) failed:`)
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}

const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)))
await writeFile(
  SOURCES_DIR + 'SOURCES.lock.json',
  JSON.stringify({ fetchedAt: new Date().toISOString(), files: sorted }, null, 2) + '\n',
)
const total = Object.values(lock).reduce((n, f) => n + f.bytes, 0)
console.log(`Fetched ${jobs.length} files (${(total / 1e6).toFixed(1)} MB) into data/sources/`)
