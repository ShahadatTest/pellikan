// Text normalization shared by the data build and the UI, so what we index at
// build time is exactly what we search for at run time.

/** Greek: lowercase, strip accents/breathings/diaeresis, fold final sigma. */
export function normalizeGreek(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .normalize('NFC')
}

/** Hebrew/Aramaic: strip cantillation + vowel points and punctuation, keep consonants. */
export function normalizeHebrew(s: string): string {
  return s.replace(/\//g, '').replace(/[֑-ׇ]/g, '')
}

/** Detects which script a user typed, so one search box can serve both. */
export function detectScript(s: string): 'greek' | 'hebrew' | 'latin' {
  if (/[Ͱ-Ͽἀ-῿]/.test(s)) return 'greek'
  if (/[֐-׿]/.test(s)) return 'hebrew'
  return 'latin'
}

/**
 * Turns free text into a safe FTS5 query. Every term is quoted, so user input
 * can never be parsed as FTS syntax (no stray AND/OR/NEAR/column filters, no
 * syntax errors from punctuation). Terms are ANDed; the last one is treated as a
 * prefix so results appear while typing. A phrase in "double quotes" stays a phrase.
 */
export function toFtsQuery(input: string, opts: { prefix?: boolean } = {}): string | null {
  const prefix = opts.prefix ?? true
  const phrase = /^\s*"([^"]+)"\s*$/.exec(input)
  const terms = (phrase ? phrase[1]! : input).match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)
  if (!terms || terms.length === 0) return null
  const clean = terms.map((t) => t.replace(/["’']/g, ' ').trim()).filter(Boolean)
  if (clean.length === 0) return null
  if (phrase) return `"${clean.join(' ')}"`
  return clean.map((t, i) => (prefix && i === clean.length - 1 ? `"${t}"*` : `"${t}"`)).join(' ')
}
