import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseUsfmBook } from './web.mjs'
import { parseLemma, parseOshbBook, parseVerseMap, buildVerseResolver, findPsalmTitles } from './oshb.mjs'
import { parseMorphGnt, englishRef } from './morphgnt.mjs'

test('USFM: strong-tagged words, footnotes, paragraphs', () => {
  const usfm = [
    '\\id GEN',
    '\\c 1',
    '\\p',
    '\\v 1 \\w In|strong="H7225"\\w* the beginning\\f + \\fr 1:1 \\ft Or “In a beginning”\\f* God.',
    '\\v 2 Second verse.',
  ].join('\n')
  const { verses, notes } = parseUsfmBook(usfm, 'Gen')
  assert.equal(verses.length, 2)
  assert.equal(verses[0].para, 1)
  assert.equal(verses[0].text, 'In the beginning God.')
  assert.deepEqual(verses[0].tokens[0], ['In', 'H7225', 0])
  assert.equal(notes.length, 1)
  assert.equal(notes[0].kind, 'footnote')
  assert.match(notes[0].text, /In a beginning/)
  assert.equal(verses[1].text, 'Second verse.')
})

test('USFM: words of Jesus flag and tokens always join to text', () => {
  const usfm = '\\c 5\n\\p\n\\v 3 He said, \\wj Blessed are the poor\\wj* indeed.'
  const { verses } = parseUsfmBook(usfm, 'Matt')
  const v = verses[0]
  assert.equal(v.tokens.map((t) => t[0]).join(''), v.text)
  assert.ok(v.tokens.some((t) => t[2] === 1 && t[0].includes('Blessed')))
  assert.ok(v.tokens.some((t) => t[2] === 0 && t[0].includes('indeed')))
})

test('USFM: psalm description heading and poetry', () => {
  const usfm = '\\c 3\n\\d A Psalm by David.\n\\q1\n\\v 1 Yahweh, how many are my adversaries!\n\\q2 Many are rising up against me.'
  const { verses, headings } = parseUsfmBook(usfm, 'Ps')
  assert.equal(headings[0].kind, 'd')
  assert.equal(headings[0].before_verse, 1)
  assert.equal(verses[0].poetry, 1)
  assert.match(verses[0].text, /\n/)
})

test('USFM: unknown markers fail loudly instead of being dropped', () => {
  assert.throws(() => parseUsfmBook('\\c 1\n\\zzz oops\n\\v 1 x', 'X'), /unhandled USFM marker/)
})

test('OSHB lemma shapes', () => {
  assert.deepEqual(parseLemma('b/7225'), { strongs: 'H7225', lemmaKey: 'H7225' })
  assert.deepEqual(parseLemma('1254 a'), { strongs: 'H1254', lemmaKey: 'H1254a' })
  assert.deepEqual(parseLemma('1177+'), { strongs: 'H1177', lemmaKey: 'H1177+' })
  assert.deepEqual(parseLemma('l'), { strongs: null, lemmaKey: 'H:l' })
  assert.throws(() => parseLemma('???'))
})

test('OSHB: morphemes, trail punctuation, ketiv/qere', () => {
  const xml = `<osis><verse osisID="Gen.1.1">
<w lemma="b/7225" n="1.1.0" morph="HR/Ncfsa" id="01xeN">בְּ/רֵאשִׁ֖ית</w>
<w lemma="1254 a" morph="HVqp3ms" id="01Nvk">בָּרָ֣א</w>
<seg type="x-maqqef">־</seg>
<w lemma="430" morph="HNcmpa" id="01abc">אֱלֹהִ֑ים</w>
<seg type="x-sof-pasuq">׃</seg>
</verse>
<verse osisID="Ps.1.2"><w lemma="1" morph="HNcmsa" type="x-ketiv" id="a">א</w><note type="variant"><rdg type="x-qere"><w lemma="2" morph="HNcmsa" id="b">ב</w></rdg></note></verse></osis>`
  const w = parseOshbBook(xml, 'test')
  assert.equal(w.length, 5)
  assert.equal(w[0].text, 'בְּרֵאשִׁ֖ית')
  assert.equal(w[0].parts, 'בְּ/רֵאשִׁ֖ית')
  assert.equal(w[0].strongs, 'H7225')
  assert.equal(w[1].lemmaKey, 'H1254a')
  assert.equal(w[1].trail, '־')
  assert.equal(w[2].trail, '׃')
  assert.equal(w[3].variant, 'ketiv')
  assert.equal(w[4].variant, 'qere')
  assert.equal(w[4].position, 2)
})

test('OSHB: VerseMap resolver and psalm titles', () => {
  const entries = parseVerseMap(`<verseMap><book osisID="Ps">
<verse wlc="Ps.3.2" kjv="Ps.3.1" type="full"/>
<verse wlc="Ps.3.3" kjv="Ps.3.2" type="full"/>
<verse wlc="Ps.13.6!a" kjv="Ps.13.5" type="partial"/>
</book></verseMap>`)
  assert.equal(entries.length, 3)
  assert.equal(entries[2].partial, 1)
  const resolve = buildVerseResolver(entries, 'Ps')
  assert.deepEqual(resolve(3, 2), [3, 1])
  assert.deepEqual(resolve(3, 3), [3, 2])
  assert.deepEqual(resolve(9, 9), [9, 9]) // unlisted: identity
  assert.deepEqual(resolve(13, 6), [13, 6]) // partial: deliberately not applied
  const titles = findPsalmTitles([{ chapter: 3, verse: 1 }, { chapter: 3, verse: 2 }], resolve)
  assert.deepEqual([...titles.get(3)], [1]) // Hebrew 3:1 is the title, 3:2 is English 3:1
})

test('MorphGNT: columns and positions', () => {
  const w = parseMorphGnt('010101 N- ----NSF- Βίβλος Βίβλος βίβλος βίβλος\n010101 N- ----GSF- γενέσεως γενέσεως γενέσεως γένεσις\n010102 N- ----NSM- Ἀβραάμ, Ἀβραάμ Ἀβραάμ Ἀβραάμ\n', 'Mt')
  assert.equal(w.length, 3)
  assert.equal(w[1].position, 2)
  assert.equal(w[1].lemma, 'γένεσις')
  assert.equal(w[2].verse, 2)
  assert.throws(() => parseMorphGnt('010101 N- x y', 'bad'), /expected 7 columns/)
})

test('MorphGNT: Greek -> English numbering exceptions', () => {
  assert.deepEqual(englishRef('John', 3, 16, 1), [3, 16])
  assert.deepEqual(englishRef('Acts', 19, 40, 21), [19, 40])
  assert.deepEqual(englishRef('Acts', 19, 40, 22), [19, 41])
  assert.deepEqual(englishRef('2Cor', 13, 12, 5), [13, 12])
  assert.deepEqual(englishRef('2Cor', 13, 12, 6), [13, 13])
  assert.deepEqual(englishRef('2Cor', 13, 13, 1), [13, 14])
  assert.deepEqual(englishRef('3John', 1, 15, 3), [1, 14])
  assert.deepEqual(englishRef('Rev', 12, 18, 1), [13, 1])
})

test('real data: Genesis 1:1 in the downloaded OSHB file', async (t) => {
  let xml
  try {
    xml = await readFile(new URL('../../sources/oshb/Gen.xml', import.meta.url), 'utf8')
  } catch {
    return t.skip('run `npm run data:fetch` first')
  }
  const words = parseOshbBook(xml, 'Gen').filter((w) => w.chapter === 1 && w.verse === 1)
  assert.equal(words.length, 7)
  assert.equal(words[0].strongs, 'H7225')
  assert.equal(words.at(-1).trail, '׃')
})
