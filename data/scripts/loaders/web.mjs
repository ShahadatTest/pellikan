// World English Bible loader (USFM from ebible.org, with Strong's numbers on English words).
//
// Output per verse: plain text, plus a token list so the UI can make each tagged word clickable:
//   tokens = [[text, strongs|null, flags, noteSeq?], ...]    flags: 1 = words of Jesus, 2 = note marker
// See data/schema/bible.sql for the full description.

import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { BOOK_BY_USFM } from '../../../shared/books.ts'

const JESUS = 1
const NOTE = 2

// Block-level markers that begin a new paragraph / line. Value = is it poetry?
const BLOCKS = { p: false, m: false, mi: false, pi1: false, pi2: false, li1: false, li2: false, q1: true, q2: true, q3: true }
// Markers that carry no scripture text we keep.
const IGNORED = new Set(['id', 'ide', 'h', 'toc1', 'toc2', 'toc3', 'mt1', 'mt2', 'mt3', 'cl', 'b', 'nb'])
const HEADINGS = { ms1: 'ms', d: 'd', sp: 'sp' }

function cleanNote(body) {
  return body
    .replace(/^\s*[+\-?*]\s+/, '') // caller
    .replace(/\\fr\s+[^\\]*/, '') // "1:1 " origin reference
    .replace(/\\xo\s+[^\\]*/, '') // cross-reference origin
    .replace(/\\\+?[a-z]+\d?\*?/g, '') // remaining inline markers; their text stays
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
}

/**
 * Parses the inline markup of one chunk of USFM into tokens. `state` carries the words-of-Jesus
 * flag across lines; `notes` collects footnotes/cross-references found in the chunk.
 */
function parseInline(s, state, notes) {
  const tokens = []
  let buf = ''
  const flush = () => {
    if (buf) {
      tokens.push([buf, null, state.jesus ? JESUS : 0])
      buf = ''
    }
  }
  const MARK = /\\(\+?)([a-z]+\d?)(\*?)/y
  let i = 0
  while (i < s.length) {
    if (s[i] !== '\\') {
      buf += s[i++]
      continue
    }
    MARK.lastIndex = i
    const m = MARK.exec(s)
    if (!m) {
      buf += s[i++]
      continue
    }
    const [whole, plus, name, closing] = m
    let next = i + whole.length
    if (name === 'w' && !closing) {
      const end = s.slice(next).search(/\\\+?w\*/)
      if (end < 0) throw new Error(`Unclosed \\w in: ${s.slice(i, i + 80)}`)
      const inner = s.slice(next, next + end).replace(/^ /, '')
      const bar = inner.indexOf('|')
      const word = bar < 0 ? inner : inner.slice(0, bar)
      const strong = bar < 0 ? null : (/strong="([^"]+)"/.exec(inner.slice(bar)) ?? [])[1] ?? null
      flush()
      tokens.push([word, strong, state.jesus ? JESUS : 0])
      next = next + end + (s.slice(next + end).match(/^\\\+?w\*/)?.[0].length ?? 0)
    } else if ((name === 'f' || name === 'x') && !closing) {
      const close = `\\${name}*`
      const end = s.indexOf(close, next)
      if (end < 0) throw new Error(`Unclosed \\${name} in: ${s.slice(i, i + 80)}`)
      const text = cleanNote(s.slice(next, end))
      flush()
      if (text) {
        notes.push({ kind: name === 'f' ? 'footnote' : 'xref', text })
        tokens.push(['', null, NOTE, notes.length])
      }
      next = end + close.length
    } else if (name === 'wj') {
      flush()
      state.jesus = !closing
      if (!closing && s[next] === ' ') next++
    } else if (!closing && s[next] === ' ') {
      next++ // opening marker: swallow the single delimiter space
    }
    void plus
    i = next
  }
  flush()
  return tokens
}

function mergePlain(tokens) {
  const out = []
  for (const t of tokens) {
    const prev = out[out.length - 1]
    if (prev && prev[1] === null && t[1] === null && prev[2] === t[2] && prev[2] !== NOTE && t[2] !== NOTE && prev.length === 3 && t.length === 3) {
      prev[0] += t[0]
    } else out.push(t.slice())
  }
  return out
}

function finishVerse(v) {
  let tokens = mergePlain(v.tokens)
  // Trim whitespace at both ends of the verse.
  while (tokens.length && tokens[0][1] === null && tokens[0][2] !== NOTE && !tokens[0][0].trim()) tokens.shift()
  if (tokens.length && tokens[0][1] === null && tokens[0][2] !== NOTE) tokens[0][0] = tokens[0][0].replace(/^\s+/, '')
  while (tokens.length && tokens.at(-1)[1] === null && tokens.at(-1)[2] !== NOTE && !tokens.at(-1)[0].trim()) tokens.pop()
  const last = tokens.at(-1)
  if (last && last[1] === null && last[2] !== NOTE) last[0] = last[0].replace(/\s+$/, '')
  return { ...v, tokens, text: tokens.map((t) => t[0]).join('') }
}

/** Parses one USFM book file. Pure function, no I/O: unit-testable. */
export function parseUsfmBook(usfm, label = 'book') {
  const verses = []
  const headings = []
  const notes = []
  const state = { jesus: false }

  let chapter = 0
  let cur = null // verse being built
  let pendingBreak = false // a block marker has been seen since the last text
  let blockPoetry = false
  let pendingHeadings = []
  const seen = new Set()

  const closeVerse = () => {
    if (cur) verses.push(finishVerse(cur))
    cur = null
  }

  for (const rawLine of usfm.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line) continue
    const lm = /^\\([a-z]+\d?)(?:\s+(.*))?$/.exec(line)

    if (!lm) {
      // Continuation text with no marker: part of the current verse.
      if (cur) cur.tokens.push(...parseInline(' ' + line, state, cur.notes))
      continue
    }
    const [, marker, rest = ''] = lm

    if (marker === 'c') {
      closeVerse()
      chapter = parseInt(rest, 10)
      if (!Number.isInteger(chapter)) throw new Error(`${label}: bad chapter line "${line}"`)
      pendingHeadings = []
    } else if (marker === 'v') {
      closeVerse()
      const vm = /^(\d+)\s*(.*)$/.exec(rest)
      if (!vm) throw new Error(`${label} ${chapter}: bad verse line "${line.slice(0, 60)}"`)
      const verse = parseInt(vm[1], 10)
      const key = `${chapter}:${verse}`
      if (seen.has(key)) throw new Error(`${label}: duplicate verse ${key}`)
      seen.add(key)
      for (const [i, h] of pendingHeadings.entries()) headings.push({ chapter, before_verse: verse, seq: i + 1, ...h })
      pendingHeadings = []
      const vNotes = []
      cur = { chapter, verse, para: pendingBreak ? 1 : 0, poetry: blockPoetry ? 1 : 0, tokens: [], notes: vNotes }
      pendingBreak = false
      cur.tokens.push(...parseInline(vm[2], state, vNotes))
    } else if (marker in BLOCKS) {
      blockPoetry = BLOCKS[marker]
      const content = rest.trim()
      if (cur && content) {
        // The verse continues on a new line/paragraph.
        cur.tokens.push(['\n', null, 0], ...parseInline(content, state, cur.notes))
        if (BLOCKS[marker]) cur.poetry = 1
      } else {
        pendingBreak = true
      }
    } else if (marker in HEADINGS) {
      const text = parseInline(rest, state, []).map((t) => t[0]).join('').trim()
      if (text) pendingHeadings.push({ kind: HEADINGS[marker], text })
    } else if (IGNORED.has(marker)) {
      if (marker === 'nb') pendingBreak = false
    } else {
      throw new Error(`${label}: unhandled USFM marker \\${marker} (line: "${line.slice(0, 60)}"). Update loaders/web.mjs.`)
    }
  }
  closeVerse()

  // Flatten per-verse notes.
  for (const v of verses) {
    v.notes.forEach((n, i) => notes.push({ chapter: v.chapter, verse: v.verse, seq: i + 1, kind: n.kind, text: n.text }))
    delete v.notes
  }
  return { verses, headings, notes }
}

/** Reads the WEB zip and inserts the 66 canon books (the deuterocanon files in the zip are skipped). */
export async function loadWeb(db, { zipPath, sourceId = 'WEB', log = () => {} }) {
  const files = unzipSync(new Uint8Array(await readFile(zipPath)))
  const insVerse = db.prepare(
    'INSERT INTO verses (translation_id, book_id, chapter, verse, text, tokens, para, poetry) VALUES (?,?,?,?,?,?,?,?)',
  )
  const insHeading = db.prepare(
    'INSERT INTO headings (translation_id, book_id, chapter, before_verse, seq, kind, text) VALUES (?,?,?,?,?,?,?)',
  )
  const insNote = db.prepare(
    'INSERT INTO notes (translation_id, book_id, chapter, verse, seq, kind, text) VALUES (?,?,?,?,?,?,?)',
  )
  const stats = { books: 0, verses: 0, headings: 0, notes: 0, taggedWords: 0 }
  const chapters = new Map()
  const skipped = []

  db.exec('BEGIN')
  try {
    for (const name of Object.keys(files).sort()) {
      const m = /^\d+-([A-Z0-9]{3})eng-web\.usfm$/.exec(name)
      if (!m) continue
      const book = BOOK_BY_USFM[m[1]]
      if (!book) {
        skipped.push(m[1])
        continue
      }
      const { verses, headings, notes } = parseUsfmBook(strFromU8(files[name]), book.osis)
      for (const v of verses) {
        insVerse.run(sourceId, book.id, v.chapter, v.verse, v.text, JSON.stringify(v.tokens), v.para, v.poetry)
        stats.taggedWords += v.tokens.filter((t) => t[1]).length
      }
      for (const h of headings) insHeading.run(sourceId, book.id, h.chapter, h.before_verse, h.seq, h.kind, h.text)
      for (const n of notes) insNote.run(sourceId, book.id, n.chapter, n.verse, n.seq, n.kind, n.text)
      chapters.set(book.id, Math.max(...verses.map((v) => v.chapter)))
      stats.books++
      stats.verses += verses.length
      stats.headings += headings.length
      stats.notes += notes.length
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  log(`WEB: ${stats.books} books, ${stats.verses} verses, ${stats.taggedWords} Strong's-tagged words, ${stats.notes} notes (skipped non-canon: ${skipped.length ? skipped.join(' ') : 'none'})`)
  return { stats, chapters }
}
