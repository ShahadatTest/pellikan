// Turns the light markup found in the source texts (ThML, TEI, OSIS, HTML-ish) into plain text.
// Paragraph structure survives as "\n"; everything else (italics, links, scripture-reference tags) keeps its text only.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…' }

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

export function markupToText(markup) {
  return decodeEntities(
    markup
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|title|l|lg|entryFree|h\d)>/gi, '\n')
      .replace(/<div\b[^>]*type="x-p"[^>]*\/>/gi, '\n')
      .replace(/<(p|lg|l)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/** "ABEL-BETH-MAACHAH" -> "Abel-Beth-Maachah". Only used when the source has no properly cased headword. */
export function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s\-'(])([a-z])/g, (_, a, b) => a + b.toUpperCase())
}
