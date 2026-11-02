import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseReference } from './reference.ts'
import { decodeGreekMorph, decodeHebrewMorph } from './morph.ts'
import { normalizeGreek, normalizeHebrew, toFtsQuery, detectScript } from './text.ts'
import { BOOKS } from './books.ts'

test('book list is the 66-book canon with unique ids', () => {
  assert.equal(BOOKS.length, 66)
  assert.equal(new Set(BOOKS.map((b) => b.osis)).size, 66)
  assert.equal(new Set(BOOKS.map((b) => b.usfm)).size, 66)
  assert.equal(BOOKS[0].osis, 'Gen')
  assert.equal(BOOKS[38].osis, 'Mal')
  assert.equal(BOOKS[39].osis, 'Matt')
  assert.equal(BOOKS[65].osis, 'Rev')
})

test('parseReference: common forms', () => {
  const p = (s) => {
    const r = parseReference(s)
    return r && [r.book.osis, r.chapter, r.verse, r.verseEnd]
  }
  assert.deepEqual(p('Rom 8:28'), ['Rom', 8, 28, undefined])
  assert.deepEqual(p('romans 8:28'), ['Rom', 8, 28, undefined])
  assert.deepEqual(p('Jn 3:16-18'), ['John', 3, 16, 18])
  assert.deepEqual(p('1 Cor 13'), ['1Cor', 13, undefined, undefined])
  assert.deepEqual(p('1cor13:4'), ['1Cor', 13, 4, undefined])
  assert.deepEqual(p('I John 4:8'), ['1John', 4, 8, undefined])
  assert.deepEqual(p('II Kings 2'), ['2Kgs', 2, undefined, undefined])
  assert.deepEqual(p('First Samuel 17'), ['1Sam', 17, undefined, undefined])
  assert.deepEqual(p('Song of Solomon 2:1'), ['Song', 2, 1, undefined])
  assert.deepEqual(p('Psalm 23'), ['Ps', 23, undefined, undefined])
  assert.deepEqual(p('Gen.1.1'), ['Gen', 1, 1, undefined])
  assert.deepEqual(p('Genesis'), ['Gen', undefined, undefined, undefined])
  assert.deepEqual(p('Phlm 1:4'), ['Phlm', 1, 4, undefined])
  assert.deepEqual(p('Phil 4:13'), ['Phil', 4, 13, undefined])
})

test('parseReference: rejects junk instead of guessing', () => {
  assert.equal(parseReference('hello world'), null)
  assert.equal(parseReference('3:16'), null)
  assert.equal(parseReference('John 3:18-16'), null)
  assert.equal(parseReference('John 0'), null)
  assert.equal(parseReference(''), null)
})

test('Greek morphology (MorphGNT)', () => {
  // John 1:1 ἦν  V- 3IAI-S--
  assert.deepEqual(decodeGreekMorph('V-', '3IAI-S--').features, ['imperfect', 'active', 'indicative', '3rd person', 'singular'])
  // ἀρχῇ  N- ----DSF-
  const n = decodeGreekMorph('N-', '----DSF-')
  assert.equal(n.pos, 'noun')
  assert.deepEqual(n.features, ['dative', 'singular', 'feminine'])
  assert.equal(decodeGreekMorph('RA', '----ASM-').pos, 'definite article')
  assert.equal(decodeGreekMorph('P-', '--------').features.length, 0)
})

test('Hebrew morphology (OSHM)', () => {
  // Gen 1:1 בְּ/רֵאשִׁית  HR/Ncfsa
  const a = decodeHebrewMorph('HR/Ncfsa')
  assert.equal(a.language, 'Hebrew')
  assert.equal(a.segments.length, 2)
  assert.equal(a.segments[0].pos, 'preposition')
  assert.deepEqual(a.segments[1].features, ['common', 'feminine', 'singular', 'absolute'])
  // בָּרָא  HVqp3ms  (qal perfect 3ms)
  assert.deepEqual(decodeHebrewMorph('HVqp3ms').segments[0].features, ['qal', 'perfect', '3rd person', 'masculine', 'singular'])
  // מְרַחֶפֶת  HVprfsa  (piel participle active, fem sg absolute, no person)
  assert.deepEqual(decodeHebrewMorph('HVprfsa').segments[0].features, ['piel', 'participle active', 'feminine', 'singular', 'absolute'])
  // infinitive construct takes no person/gender/number
  assert.deepEqual(decodeHebrewMorph('HVqc').segments[0].features, ['qal', 'infinitive construct'])
  // suffix: pronominal 3ms
  assert.deepEqual(decodeHebrewMorph('HNcmsc/Sp3ms').segments[1].features, ['pronominal', '3rd person', 'masculine', 'singular'])
  // Aramaic uses its own stem table
  assert.equal(decodeHebrewMorph('AVap3ms').language, 'Aramaic')
  assert.equal(decodeHebrewMorph('AVap3ms').segments[0].features[0], 'aphel')
})

test('normalization', () => {
  assert.equal(normalizeGreek('λόγος,'), 'λογοσ,')
  assert.equal(normalizeGreek('Ἐν'), 'εν')
  assert.equal(normalizeGreek('ἀρχῇ'), 'αρχη')
  // Hebrew: pointing and accents stripped, morpheme slashes removed
  assert.equal(normalizeHebrew('בְּ/רֵאשִׁ֖ית'), 'בראשית')
  assert.equal(detectScript('λόγος'), 'greek')
  assert.equal(detectScript('בראשית'), 'hebrew')
  assert.equal(detectScript('grace'), 'latin')
})

test('toFtsQuery never emits raw FTS syntax', () => {
  assert.equal(toFtsQuery('faith hope'), '"faith" "hope"*')
  assert.equal(toFtsQuery('faith hope', { prefix: false }), '"faith" "hope"')
  assert.equal(toFtsQuery('"in the beginning"'), '"in the beginning"')
  assert.equal(toFtsQuery('God’s love'), '"God s" "love"*')
  // hostile / accidental syntax is neutralised
  assert.equal(toFtsQuery('grace OR NEAR(a b) -x*'), '"grace" "OR" "NEAR" "a" "b" "x"*')
  assert.equal(toFtsQuery('   '), null)
  assert.equal(toFtsQuery('***'), null)
})


test('toFtsQuery: punctuation-only input yields null (search page empty-query path)', () => {
  for (const q of ['???', '***', '@#$', '   ', '""']) {
    assert.equal(toFtsQuery(q, { prefix: false }), null, q)
  }
  assert.ok(toFtsQuery('love', { prefix: false }))
})
