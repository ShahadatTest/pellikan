// Open Scriptures Hebrew Bible loader (Westminster Leningrad Codex text + OSHB lemma/morphology).
//
// Handled:
//  * morpheme boundaries ("בְּ/רֵאשִׁית"): shown joined, kept in `parts`, aligned with the morph code
//  * Ketiv/Qere: the written word is stored as 'ketiv', the read word as 'qere' (hidden by default in the UI)
//  * trailing punctuation (maqqef, sof pasuq, paseq) stored in `trail`
//  * Hebrew -> English verse numbering via OSHB's VerseMap.xml (words.eng_chapter / eng_verse)
//
// Known limitation: 7 verses are only *partly* renumbered by VerseMap.xml (type="partial"). OSHB gives no
// word-level split point, so those verses stay where the Hebrew puts them. They are recorded in
// versification_map with partial = 1.

import { readFile } from 'node:fs/promises'
import { BOOKS } from '../../../shared/books.ts'
import { normalizeHebrew } from '../../../shared/text.ts'

const TOKEN = /<(\/?)([A-Za-z]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g
const TRAIL_TYPES = new Set(['x-maqqef', 'x-sof-pasuq', 'x-paseq'])

function attrs(s) {
  const out = {}
  for (const m of s.matchAll(/([\w:.-]+)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

const decodeEntities = (s) =>
  s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e])

/**
 * Lemma attribute -> identity fields.
 *   "b/7225"   -> prefix b, Strong's 7225
 *   "1254 a"   -> Strong's 1254, disambiguation letter "a" (OSHB: "not implemented in the Strong's dictionary")
 *   "1177+"    -> trailing "+" is not documented by OSHB; preserved in the key, never interpreted
 *   "l"        -> a bare letter (preposition + pronominal suffix); no Strong's number exists
 */
export function parseLemma(raw) {
  const segs = raw.split('/')
  const main = segs[segs.length - 1]
  const m = /^(\d+)(?: ([a-z]))?(\+)?$/.exec(main)
  if (m) {
    return {
      strongs: 'H' + m[1],
      lemmaKey: 'H' + m[1] + (m[2] ?? '') + (m[3] ?? ''),
    }
  }
  if (/^[a-z]$/.test(main)) return { strongs: null, lemmaKey: 'H:' + main }
  throw new Error(`Unrecognized OSHB lemma "${raw}"`)
}

/** Parses one OSHB book file into word records, in reading order. Pure function: unit-testable. */
export function parseOshbBook(xml, label = 'book') {
  const words = []
  let ref = null // { chapter, verse } of the verse being read
  let position = 0
  let inNote = false
  let inQere = false
  let openWord = null // <w> being read: { a, text }
  let openSeg = null // <seg> being read: { type, text }
  let last = null // last written (non-qere) word of this verse; receives trailing punctuation

  for (const m of xml.matchAll(TOKEN)) {
    const [, closing, tag, attrText, selfClose, text] = m

    if (text !== undefined) {
      if (openWord) openWord.text += text
      else if (openSeg) openSeg.text += text
      continue
    }

    if (tag === 'verse') {
      if (closing) {
        ref = null
        continue
      }
      const id = /^[A-Za-z0-9]+\.(\d+)\.(\d+)$/.exec(attrs(attrText).osisID ?? '')
      if (!id) throw new Error(`${label}: bad verse id "${attrs(attrText).osisID}"`)
      ref = { chapter: +id[1], verse: +id[2] }
      position = 0
      last = null
    } else if (tag === 'note') {
      inNote = !closing && !selfClose
    } else if (tag === 'rdg') {
      inQere = !closing && !selfClose && attrs(attrText).type === 'x-qere'
    } else if (tag === 'w' && !closing) {
      const a = attrs(attrText)
      if (!ref) throw new Error(`${label}: <w> outside a verse`)
      if (a.lemma === undefined || a.morph === undefined) {
        throw new Error(`${label} ${ref.chapter}:${ref.verse}: word without lemma/morph`)
      }
      openWord = { a, text: '' }
    } else if (tag === 'w' && closing && openWord) {
      const { a } = openWord
      const parts = decodeEntities(openWord.text.trim())
      const lem = parseLemma(a.lemma)
      const word = {
        chapter: ref.chapter,
        verse: ref.verse,
        position: ++position,
        lang: a.morph[0] === 'A' ? 'arc' : 'heb',
        text: parts.replace(/\//g, ''),
        parts,
        trail: null,
        search: normalizeHebrew(parts),
        lemma: null, // OSHB carries Strong's numbers, not lemma text; a lexicon fills this in later
        lemmaKey: lem.lemmaKey,
        strongs: lem.strongs,
        morph: a.morph,
        variant: inQere ? 'qere' : a.type === 'x-ketiv' ? 'ketiv' : null,
        srcId: a.id ?? null,
      }
      words.push(word)
      if (!inQere) last = word
      openWord = null
    } else if (tag === 'seg' && !closing && !selfClose && !inNote) {
      openSeg = { type: attrs(attrText).type, text: '' }
    } else if (tag === 'seg' && closing && openSeg) {
      // <seg type="x-maqqef">־</seg> follows the word it belongs to.
      if (last && TRAIL_TYPES.has(openSeg.type) && openSeg.text) last.trail = (last.trail ?? '') + openSeg.text
      openSeg = null
    }
  }
  if (openWord) throw new Error(`${label}: unterminated <w>`)
  return words
}

/** Parses VerseMap.xml into [{ book, srcChapter, srcVerse, engChapter, engVerse, partial }]. */
export function parseVerseMap(xml) {
  const ref = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:!([a-z]))?$/
  const rows = []
  for (const m of xml.matchAll(/<verse\s+wlc="([^"]+)"\s+kjv="([^"]+)"\s+type="([^"]+)"\s*\/>/g)) {
    const w = ref.exec(m[1])
    const k = ref.exec(m[2])
    if (!w || !k) throw new Error(`Unrecognized VerseMap entry ${m[0]}`)
    rows.push({
      book: w[1],
      srcChapter: +w[2],
      srcVerse: +w[3],
      engChapter: +k[2],
      engVerse: +k[3],
      partial: m[3] === 'full' && !w[4] && !k[4] ? 0 : 1,
    })
  }
  return rows
}

/**
 * Source verse -> English verse for one book. Full mappings only; partial ones are not applied
 * (see the limitation note at the top of this file). Unlisted verses keep their own numbers.
 */
export function buildVerseResolver(entries, osis) {
  const full = new Map()
  for (const e of entries) {
    if (e.book === osis && !e.partial) full.set(`${e.srcChapter}:${e.srcVerse}`, [e.engChapter, e.engVerse])
  }
  return (chapter, verse) => full.get(`${chapter}:${verse}`) ?? [chapter, verse]
}

/**
 * Psalm titles. OSHB maps every Hebrew verse after a title onto the English numbering but leaves the title
 * verses themselves unmapped, so they would collide with English verse 1. When several Hebrew verses resolve to
 * English verse 1 of one psalm, only the last is the real verse 1; the earlier ones are the (unnumbered) title.
 * Returns Map(englishChapter -> Set(Hebrew verse numbers that are title)).
 */
export function findPsalmTitles(words, resolve) {
  const verseOne = new Map() // english chapter -> Set(hebrew verses resolving to english verse 1)
  for (const w of words) {
    const [c, v] = resolve(w.chapter, w.verse)
    if (v !== 1) continue
    if (!verseOne.has(c)) verseOne.set(c, new Set())
    verseOne.get(c).add(w.verse)
  }
  const titles = new Map()
  for (const [c, set] of verseOne) {
    const sorted = [...set].sort((a, b) => a - b)
    if (sorted.length > 1) titles.set(c, new Set(sorted.slice(0, -1)))
  }
  return titles
}

export async function loadOshb(db, { dir, sourceId = 'OSHB', log = () => {} }) {
  const mapRows = parseVerseMap(await readFile(`${dir}/VerseMap.xml`, 'utf8'))

  const insMap = db.prepare(
    'INSERT OR REPLACE INTO versification_map (book_id, src_chapter, src_verse, eng_chapter, eng_verse, partial) VALUES (?,?,?,?,?,?)',
  )
  const insWord = db.prepare(
    `INSERT INTO words (source_id, lang, book_id, seq, chapter, verse, eng_chapter, eng_verse, position, text, parts, trail,
                        search, lemma, lemma_key, strongs, pos, morph, variant, src_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )

  const stats = { books: 0, words: 0, ketiv: 0, qere: 0, aramaic: 0, remapped: 0, titleWords: 0 }
  db.exec('BEGIN')
  try {
    for (const b of BOOKS.filter((x) => x.testament === 'OT')) {
      for (const r of mapRows.filter((x) => x.book === b.osis)) {
        insMap.run(b.id, r.srcChapter, r.srcVerse, r.engChapter, r.engVerse, r.partial)
      }
      const words = parseOshbBook(await readFile(`${dir}/${b.osis}.xml`, 'utf8'), b.osis)
      const resolve = buildVerseResolver(mapRows, b.osis)
      const titles = b.osis === 'Ps' ? findPsalmTitles(words, resolve) : new Map()

      words.forEach((w, i) => {
        let [ec, ev] = resolve(w.chapter, w.verse)
        if (titles.get(ec)?.has(w.verse)) {
          ev = 0
          stats.titleWords++
        }
        if (ec !== w.chapter || ev !== w.verse) stats.remapped++
        insWord.run(sourceId, w.lang, b.id, i + 1, w.chapter, w.verse, ec, ev, w.position, w.text, w.parts, w.trail,
          w.search, w.lemma, w.lemmaKey, w.strongs, null, w.morph, w.variant, w.srcId)
        stats.words++
        if (w.variant === 'ketiv') stats.ketiv++
        if (w.variant === 'qere') stats.qere++
        if (w.lang === 'arc') stats.aramaic++
      })
      stats.books++
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  log(`OSHB: ${stats.books} books, ${stats.words} words (${stats.aramaic} Aramaic, ${stats.ketiv} ketiv / ${stats.qere} qere), ${stats.remapped} renumbered to English versification, ${stats.titleWords} psalm-title words`)
  return stats
}
