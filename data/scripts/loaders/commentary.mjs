// Matthew Henry's Commentary on the Whole Bible, from the CrossWire MHC module (OSIS markup, public domain).
//
// SWORD stores a comment that covers a passage once and points every verse of the passage at the same bytes. Those
// repeats are merged back into one row with verse_start..verse_end. Each section also quotes the KJV passage before the
// exposition; that quotation is dropped, because the reader already shows the text.

import { openModule, readZCom } from './sword.mjs'
import { markupToText } from './markup.mjs'

/** Drops the paragraph(s) that are the quoted Bible text: they start with a superscript verse number or a poetry block. */
export function stripQuotedScripture(osis) {
  const parts = osis.split(/(<div\b[^>]*type="x-p"[^>]*\/>)/)
  // parts alternate: text, marker, text, marker ... A paragraph runs from an sID marker to the next eID marker.
  const out = []
  let paragraph = ''
  let inside = false
  for (const part of parts) {
    if (/^<div\b[^>]*\bsID=/.test(part)) { inside = true; paragraph = ''; continue }
    if (/^<div\b[^>]*\beID=/.test(part)) {
      if (inside) {
        const head = paragraph.trimStart()
        if (!/^<hi type="super">\d+<\/hi>/.test(head) && !/^<lg\b/.test(head)) out.push(paragraph)
      }
      inside = false
      paragraph = ''
      continue
    }
    if (inside) paragraph += part
    else out.push(part)
  }
  if (inside && paragraph) out.push(paragraph)
  return out.join('\n')
}

/** Merges consecutive slots that share the same stored text into [{..., verse_start, verse_end}]. Pure. */
export function mergeRanges(slots) {
  const out = []
  for (const s of slots) {
    const prev = out[out.length - 1]
    if (prev && s.verse > 0 && prev.ref === s.ref && prev.test === s.test && prev.book === s.book && prev.chapter === s.chapter && prev.verse_end === s.verse - 1) {
      prev.verse_end = s.verse
    } else out.push({ ...s, verse_start: s.verse, verse_end: s.verse })
  }
  return out
}

export async function loadCommentary(db, { zipPath, sourceId, shape, log = () => {} }) {
  const mod = await openModule(zipPath)
  const merged = mergeRanges(readZCom(mod, shape))
  const ins = db.prepare('INSERT INTO commentary_entries (source_id, book_id, chapter, verse_start, verse_end, body) VALUES (?,?,?,?,?,?)')
  let rows = 0
  db.exec('BEGIN')
  try {
    for (const e of merged) {
      const body = markupToText(stripQuotedScripture(e.text))
      if (!body) continue
      const bookId = (e.test === 'ot' ? 0 : 39) + e.book + 1
      ins.run(sourceId, bookId, e.chapter, e.verse_start, e.verse_end, body)
      rows++
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  log(`${sourceId}: ${rows} comments (SWORD ${mod.driver}, ${mod.license}, v${mod.version})`)
  return { rows }
}
