// MorphGNT SBLGNT loader (Greek New Testament text with morphology and lemmas).
//
// Line format (space separated, 7 columns):
//   bbccvv  pos  parse  text  word  normalized  lemma
//   040101  N-   ----NSM-  λόγος,  λόγος  λόγος  λόγος
//
// Licenses differ by layer: SBLGNT text is CC BY 4.0; the MorphGNT morphology/lemmas are CC BY-SA 3.0.
// See DATA_SOURCES.md. No Strong's numbers exist in this data; a lexicon loader would add them.

import { readFile } from 'node:fs/promises'
import { BOOKS, MORPHGNT_FILES } from '../../../shared/books.ts'
import { normalizeGreek } from '../../../shared/text.ts'

// The Greek NT is numbered almost exactly like English Bibles, but not quite. These five places were found by
// comparing SBLGNT against the WEB (check-db.mjs fails if a new mismatch shows up). `fromPosition` is the first
// word, counting from 1 within the source verse, that belongs to the English verse `to`; earlier words stay put.
// Textual differences (John 7:53-8:11 and the Romans 16 doxology, which SBLGNT leaves out of the main text) are
// not numbering issues and are deliberately left as gaps.
export const NT_RENUMBER = [
  { book: 'Acts', chapter: 19, verse: 40, fromPosition: 22, to: [19, 41] },
  { book: '2Cor', chapter: 13, verse: 12, fromPosition: 6, to: [13, 13] },
  { book: '2Cor', chapter: 13, verse: 13, fromPosition: 1, to: [13, 14] },
  { book: '3John', chapter: 1, verse: 15, fromPosition: 1, to: [1, 14] },
  { book: 'Rev', chapter: 12, verse: 18, fromPosition: 1, to: [13, 1] },
]

/** English chapter:verse for one Greek word. Words with no entry keep their own numbering. */
export function englishRef(osis, chapter, verse, position) {
  for (const r of NT_RENUMBER) {
    if (r.book === osis && r.chapter === chapter && r.verse === verse && position >= r.fromPosition) return r.to
  }
  return [chapter, verse]
}

/** Parses one MorphGNT file. Pure function: unit-testable. */
export function parseMorphGnt(text, label = 'book') {
  const words = []
  let line = 0
  let lastKey = ''
  let position = 0
  for (const raw of text.split('\n')) {
    line++
    if (!raw.trim()) continue
    const cols = raw.trim().split(/\s+/)
    if (cols.length !== 7) throw new Error(`${label}:${line}: expected 7 columns, got ${cols.length}: "${raw}"`)
    const [bcv, pos, parse, surface, word, , lemma] = cols
    if (!/^\d{6}$/.test(bcv)) throw new Error(`${label}:${line}: bad reference "${bcv}"`)
    const key = bcv
    position = key === lastKey ? position + 1 : 1
    lastKey = key
    words.push({
      bookIndex: +bcv.slice(0, 2),
      chapter: +bcv.slice(2, 4),
      verse: +bcv.slice(4, 6),
      position,
      text: surface, // keeps its punctuation, e.g. "λόγος,"
      search: normalizeGreek(word),
      lemma,
      pos,
      morph: parse,
    })
  }
  return words
}

export async function loadMorphGnt(db, { dir, sourceId = 'SBLGNT', log = () => {} }) {
  const insWord = db.prepare(
    `INSERT INTO words (source_id, lang, book_id, seq, chapter, verse, eng_chapter, eng_verse, position, text, parts, trail,
                        search, lemma, lemma_key, strongs, pos, morph, variant, src_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  const ntBooks = BOOKS.filter((b) => b.testament === 'NT')
  if (MORPHGNT_FILES.length !== ntBooks.length) throw new Error('MORPHGNT_FILES does not match the NT book list')

  const stats = { books: 0, words: 0, lemmas: new Set() }
  db.exec('BEGIN')
  try {
    for (const [i, file] of MORPHGNT_FILES.entries()) {
      const book = ntBooks[i]
      const words = parseMorphGnt(await readFile(`${dir}/${file}`, 'utf8'), file)
      words.forEach((w, n) => {
        // Guard against a mis-ordered file list silently attaching words to the wrong book.
        if (w.bookIndex !== i + 1) throw new Error(`${file}: word belongs to NT book #${w.bookIndex}, expected #${i + 1} (${book.name})`)
        const [ec, ev] = englishRef(book.osis, w.chapter, w.verse, w.position)
        insWord.run(sourceId, 'grc', book.id, n + 1, w.chapter, w.verse, ec, ev, w.position,
          w.text, null, null, w.search, w.lemma, w.lemma, null, w.pos, w.morph, null, null)
        stats.lemmas.add(w.lemma)
      })
      stats.books++
      stats.words += words.length
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  log(`SBLGNT/MorphGNT: ${stats.books} books, ${stats.words} words, ${stats.lemmas.size} distinct lemmas`)
  return { books: stats.books, words: stats.words, lemmas: stats.lemmas.size }
}
