// Canonical book list (Protestant canon, 66 books).
// This one file feeds the data loaders (Node), the reference parser, and the UI,
// so book ids are identical everywhere. `id` is the canonical order, 1..66.
//
// osis  = OSIS id, as used by OSHB (OT) and for URLs
// usfm  = USFM id, as used by the WEB source files
// Keep this file free of enums and parameter properties: it is imported directly
// by Node (type stripping) as well as by the Vite/Nuxt build.

export type Testament = 'OT' | 'NT'

export interface BookMeta {
  id: number
  osis: string
  usfm: string
  name: string
  testament: Testament
}

const ROWS: Array<[string, string, string]> = [
  ['Gen', 'GEN', 'Genesis'],
  ['Exod', 'EXO', 'Exodus'],
  ['Lev', 'LEV', 'Leviticus'],
  ['Num', 'NUM', 'Numbers'],
  ['Deut', 'DEU', 'Deuteronomy'],
  ['Josh', 'JOS', 'Joshua'],
  ['Judg', 'JDG', 'Judges'],
  ['Ruth', 'RUT', 'Ruth'],
  ['1Sam', '1SA', '1 Samuel'],
  ['2Sam', '2SA', '2 Samuel'],
  ['1Kgs', '1KI', '1 Kings'],
  ['2Kgs', '2KI', '2 Kings'],
  ['1Chr', '1CH', '1 Chronicles'],
  ['2Chr', '2CH', '2 Chronicles'],
  ['Ezra', 'EZR', 'Ezra'],
  ['Neh', 'NEH', 'Nehemiah'],
  ['Esth', 'EST', 'Esther'],
  ['Job', 'JOB', 'Job'],
  ['Ps', 'PSA', 'Psalms'],
  ['Prov', 'PRO', 'Proverbs'],
  ['Eccl', 'ECC', 'Ecclesiastes'],
  ['Song', 'SNG', 'Song of Solomon'],
  ['Isa', 'ISA', 'Isaiah'],
  ['Jer', 'JER', 'Jeremiah'],
  ['Lam', 'LAM', 'Lamentations'],
  ['Ezek', 'EZK', 'Ezekiel'],
  ['Dan', 'DAN', 'Daniel'],
  ['Hos', 'HOS', 'Hosea'],
  ['Joel', 'JOL', 'Joel'],
  ['Amos', 'AMO', 'Amos'],
  ['Obad', 'OBA', 'Obadiah'],
  ['Jonah', 'JON', 'Jonah'],
  ['Mic', 'MIC', 'Micah'],
  ['Nah', 'NAM', 'Nahum'],
  ['Hab', 'HAB', 'Habakkuk'],
  ['Zeph', 'ZEP', 'Zephaniah'],
  ['Hag', 'HAG', 'Haggai'],
  ['Zech', 'ZEC', 'Zechariah'],
  ['Mal', 'MAL', 'Malachi'],
  ['Matt', 'MAT', 'Matthew'],
  ['Mark', 'MRK', 'Mark'],
  ['Luke', 'LUK', 'Luke'],
  ['John', 'JHN', 'John'],
  ['Acts', 'ACT', 'Acts'],
  ['Rom', 'ROM', 'Romans'],
  ['1Cor', '1CO', '1 Corinthians'],
  ['2Cor', '2CO', '2 Corinthians'],
  ['Gal', 'GAL', 'Galatians'],
  ['Eph', 'EPH', 'Ephesians'],
  ['Phil', 'PHP', 'Philippians'],
  ['Col', 'COL', 'Colossians'],
  ['1Thess', '1TH', '1 Thessalonians'],
  ['2Thess', '2TH', '2 Thessalonians'],
  ['1Tim', '1TI', '1 Timothy'],
  ['2Tim', '2TI', '2 Timothy'],
  ['Titus', 'TIT', 'Titus'],
  ['Phlm', 'PHM', 'Philemon'],
  ['Heb', 'HEB', 'Hebrews'],
  ['Jas', 'JAS', 'James'],
  ['1Pet', '1PE', '1 Peter'],
  ['2Pet', '2PE', '2 Peter'],
  ['1John', '1JN', '1 John'],
  ['2John', '2JN', '2 John'],
  ['3John', '3JN', '3 John'],
  ['Jude', 'JUD', 'Jude'],
  ['Rev', 'REV', 'Revelation'],
]

export const BOOKS: BookMeta[] = ROWS.map(([osis, usfm, name], i) => ({
  id: i + 1,
  osis,
  usfm,
  name,
  testament: i < 39 ? 'OT' : 'NT',
}))

export const BOOK_BY_OSIS: Record<string, BookMeta> = Object.fromEntries(BOOKS.map((b) => [b.osis, b]))
export const BOOK_BY_USFM: Record<string, BookMeta> = Object.fromEntries(BOOKS.map((b) => [b.usfm, b]))
export const BOOK_BY_ID: Record<number, BookMeta> = Object.fromEntries(BOOKS.map((b) => [b.id, b]))

/** MorphGNT file prefix per NT book, in canonical NT order (book ids 40..66). */
export const MORPHGNT_FILES: string[] = [
  '61-Mt', '62-Mk', '63-Lk', '64-Jn', '65-Ac', '66-Ro', '67-1Co', '68-2Co', '69-Ga',
  '70-Eph', '71-Php', '72-Col', '73-1Th', '74-2Th', '75-1Ti', '76-2Ti', '77-Tit',
  '78-Phm', '79-Heb', '80-Jas', '81-1Pe', '82-2Pe', '83-1Jn', '84-2Jn', '85-3Jn',
  '86-Jud', '87-Re',
].map((p) => `${p}-morphgnt.txt`)
