// Cross-references: OpenBible.info (CC BY, votes from users) and the Treasury of Scripture Knowledge (public domain,
// from the CrossWire TSK module). Both use English (KJV) verse numbering, which is Pellikan's canonical scheme.

import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import { BOOKS, BOOK_BY_OSIS } from '../../../shared/books.ts'
import { openModule, readZCom } from './sword.mjs'
import { mergeRanges } from './commentary.mjs'
import { decodeEntities } from './markup.mjs'

// The TSK's own book abbreviations -> OSIS ids. Checked against every abbreviation in the module at load time.
const TSK_BOOKS = {
  Ge: 'Gen', Ex: 'Exod', Le: 'Lev', Nu: 'Num', De: 'Deut', Jos: 'Josh', Jud: 'Judg', Ru: 'Ruth', '1Sa': '1Sam', '2Sa': '2Sam',
  '1Ki': '1Kgs', '2Ki': '2Kgs', '1Ch': '1Chr', '2Ch': '2Chr', Ezr: 'Ezra', Ne: 'Neh', Es: 'Esth', Job: 'Job', Ps: 'Ps', Pr: 'Prov',
  Ec: 'Eccl', So: 'Song', Isa: 'Isa', Jer: 'Jer', La: 'Lam', Eze: 'Ezek', Da: 'Dan', Ho: 'Hos', Joe: 'Joel', Am: 'Amos', Ob: 'Obad',
  Jon: 'Jonah', Mic: 'Mic', Na: 'Nah', Hab: 'Hab', Zep: 'Zeph', Hag: 'Hag', Zec: 'Zech', Mal: 'Mal', Mt: 'Matt', Mr: 'Mark',
  Lu: 'Luke', Joh: 'John', Ac: 'Acts', Ro: 'Rom', '1Co': '1Cor', '2Co': '2Cor', Ga: 'Gal', Eph: 'Eph', Php: 'Phil', Col: 'Col',
  '1Th': '1Thess', '2Th': '2Thess', '1Ti': '1Tim', '2Ti': '2Tim', Tit: 'Titus', Phm: 'Phlm', Heb: 'Heb', Jas: 'Jas', '1Pe': '1Pet',
  '2Pe': '2Pet', '1Jo': '1John', '2Jo': '2John', '3Jo': '3John', Jude: 'Jude', Re: 'Rev',
}

/**
 * Parses one TSK reference list such as "Pr 8:22-24; 16:4; Joh 1:1-3; 15". Rules of the TSK's shorthand:
 *  - a book abbreviation sets the book; a bare "c:v" keeps the last book
 *  - a bare number (or "n-m") is a verse of the last chapter mentioned, starting with the verse's own chapter
 *  - "Ps 23" (book and a number with no colon) is a whole chapter, except in one-chapter books where it is a verse
 *  - "1:1-2:3" spans chapters and is stored as two rows
 * `ctx` = { book, chapter } of the verse the list belongs to. `lastVerse(bookId, chapter)` bounds ranges.
 * Returns { refs: [{ book, chapter, from, to }], skipped: [text] }.
 */
export function parseTskList(list, ctx, lastVerse) {
  const refs = []
  const skipped = []
  let book = ctx.book
  let chapter = ctx.chapter
  const push = (b, c, from, to) => {
    const max = lastVerse(b, c)
    if (!max || from < 1 || from > max) return skipped.push(`${BOOKS[b - 1]?.osis} ${c}:${from}`)
    refs.push({ book: b, chapter: c, from, to: Math.min(Math.max(to, from), max) })
  }
  for (let item of decodeEntities(list).split(';')) {
    item = item.trim()
    if (!item || item.startsWith('*')) continue
    let explicitBook = false
    const bm = /^((?:[1-3])?[A-Za-z]+)\.?\s*(.*)$/.exec(item)
    if (bm) {
      const osis = TSK_BOOKS[bm[1]]
      if (!osis) { skipped.push(item); continue }
      book = BOOK_BY_OSIS[osis].id
      chapter = null
      explicitBook = true
      item = bm[2]
    }
    const tokens = item.split(',').map((t) => t.trim()).filter(Boolean)
    tokens.forEach((tok, i) => {
      let m
      if ((m = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(tok))) {
        chapter = +m[1]
        push(book, chapter, +m[2], 999)
        push(book, +m[3], 1, +m[4])
        chapter = +m[3]
      } else if ((m = /^(\d+):(\d+)(?:-(\d+))?$/.exec(tok))) {
        chapter = +m[1]
        push(book, chapter, +m[2], m[3] ? +m[3] : +m[2])
      } else if ((m = /^(\d+)(?:-(\d+))?$/.exec(tok))) {
        if (explicitBook && i === 0 && chapter === null && lastVerse(book, 2)) {
          chapter = +m[1] // "Ps 23": a whole chapter (or a run of chapters)
          push(book, chapter, 1, 999)
        } else {
          if (chapter === null) chapter = lastVerse(book, 2) ? ctx.chapter : 1
          push(book, chapter, +m[1], m[2] ? +m[2] : +m[1])
        }
      } else skipped.push(tok)
    })
  }
  return { refs, skipped }
}

/** Splits a TSK verse entry into [{ phrase, list }]: the key phrase and the reference list that follows it. */
export function parseTskEntry(thml) {
  // Chapter-summary lines carry a passage="" attribute; they are prose, not references.
  const text = thml.replace(/<scripRef passage=[^>]*>[\s\S]*?<\/scripRef>[^<]*(?=<br)/g, '')
  const out = []
  let last = 0
  for (const m of text.matchAll(/<scripRef>([\s\S]*?)<\/scripRef>/g)) {
    const before = text.slice(last, m.index).split(/<br\s*\/?>/i).map((s) => decodeEntities(s.replace(/<[^>]+>/g, '')).trim()).filter(Boolean)
    const phrase = (before.at(-1) ?? '').replace(/[.:;,\s]+$/, '')
    out.push({ phrase: phrase && phrase.length <= 160 ? phrase : null, list: m[1] })
    last = m.index + m[0].length
  }
  return out
}

export async function loadTsk(db, { zipPath, sourceId, shape, lastVerse, log = () => {} }) {
  const mod = await openModule(zipPath)
  const slots = mergeRanges(readZCom(mod, shape)).filter((s) => s.verse > 0)
  const ins = db.prepare(
    'INSERT INTO cross_references (source_id, book_id, chapter, verse, to_book_id, to_chapter, to_verse, to_verse_end, weight, note) VALUES (?,?,?,?,?,?,?,?,0,?)',
  )
  const skipped = new Map()
  let rows = 0
  db.exec('BEGIN')
  try {
    for (const s of slots) {
      const book = (s.test === 'ot' ? 0 : 39) + s.book + 1
      for (const { phrase, list } of parseTskEntry(s.text)) {
        const { refs, skipped: bad } = parseTskList(list, { book, chapter: s.chapter }, lastVerse)
        for (const b of bad) skipped.set(b, (skipped.get(b) ?? 0) + 1)
        for (const r of refs) {
          ins.run(sourceId, book, s.chapter, s.verse_start, r.book, r.chapter, r.from, r.to, phrase)
          rows++
        }
      }
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  const bad = [...skipped.values()].reduce((a, b) => a + b, 0)
  log(`${sourceId}: ${rows} references; ${bad} items skipped as unparseable or out of range${bad ? ` (e.g. ${[...skipped.keys()].slice(0, 5).join(' | ')})` : ''}`)
  return { rows, skipped: bad }
}

const OB_VERSE = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/

export async function loadOpenBible(db, { zipPath, sourceId, lastVerse, minVotes = 1, log = () => {} }) {
  const files = unzipSync(new Uint8Array(await readFile(zipPath)))
  const name = Object.keys(files).find((n) => n.endsWith('cross_references.txt') || n.endsWith('cross-references.txt'))
  if (!name) throw new Error('OpenBible zip: cross_references.txt not found')
  const ins = db.prepare(
    'INSERT INTO cross_references (source_id, book_id, chapter, verse, to_book_id, to_chapter, to_verse, to_verse_end, weight, note) VALUES (?,?,?,?,?,?,?,?,?,NULL)',
  )
  let rows = 0
  let lowVotes = 0
  const bad = []
  db.exec('BEGIN')
  try {
    for (const line of strFromU8(files[name]).split('\n')) {
      const [from, to, votes] = line.split('\t')
      if (!to || line.startsWith('From Verse')) continue
      const f = OB_VERSE.exec(from)
      const [t1, t2] = to.split('-')
      const a = OB_VERSE.exec(t1)
      const b = t2 ? OB_VERSE.exec(t2) : a
      const fb = f && BOOK_BY_OSIS[f[1]]
      const tb = a && BOOK_BY_OSIS[a[1]]
      if (!fb || !tb || !b) { bad.push(line); continue }
      const w = parseInt(votes, 10) || 0
      if (w < minVotes) { lowVotes++; continue }
      const chapter = +a[2]
      const start = +a[3]
      const sameChapter = b[1] === a[1] && +b[2] === chapter
      const end = sameChapter ? +b[3] : lastVerse(tb.id, chapter)
      if (start > lastVerse(tb.id, chapter) || +f[3] > lastVerse(fb.id, +f[2])) { bad.push(line); continue }
      ins.run(sourceId, fb.id, +f[2], +f[3], tb.id, chapter, start, Math.max(start, end), w)
      rows++
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  log(`${sourceId}: ${rows} references with at least ${minVotes} vote(s); ${lowVotes} below that; ${bad.length} unmappable${bad.length ? ` (e.g. ${bad[0]})` : ''}`)
  return { rows, lowVotes, unmappable: bad.length }
}
