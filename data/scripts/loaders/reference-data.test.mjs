import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTskList, parseTskEntry } from './crossrefs.mjs'
import { markupToText, titleCase } from './markup.mjs'
import { mergeRanges, stripQuotedScripture } from './commentary.mjs'
import { parseStrongsHebrew, parseStrongsGreek, parseThayer, parseLexicalIndex } from './lexicon.mjs'
import { toDictionaryRows } from './dictionary.mjs'
import { parseUsfmBook } from './web.mjs'

// A tiny versification: every chapter has 50 verses, except Jude (1 chapter, 25 verses).
const lastVerse = (book, chapter) => (book === 65 ? (chapter === 1 ? 25 : 0) : chapter >= 1 && chapter <= 150 ? 50 : 0)
const JOHN = 43

test('TSK: explicit book, chapter:verse, ranges and comma lists', () => {
  const { refs } = parseTskList('Pr 8:22-24; 16:4; Mr 13:19; 1Jo 1:1,2', { book: JOHN, chapter: 3 }, lastVerse)
  assert.deepEqual(refs.map((r) => [r.book, r.chapter, r.from, r.to]), [
    [20, 8, 22, 24], [20, 16, 4, 4], [41, 13, 19, 19], [62, 1, 1, 1], [62, 1, 2, 2],
  ])
})

test('TSK: a bare number is a verse of the verse\'s own chapter, then of the last chapter named', () => {
  const a = parseTskList('15; Mt 9:13', { book: JOHN, chapter: 3 }, lastVerse).refs
  assert.deepEqual([a[0].book, a[0].chapter, a[0].from], [JOHN, 3, 15])
  const b = parseTskList('1:14,18; 15', { book: JOHN, chapter: 3 }, lastVerse).refs
  assert.deepEqual(b.map((r) => [r.chapter, r.from]), [[1, 14], [1, 18], [1, 15]])
})

test('TSK: book plus a bare number is a whole chapter, except in one-chapter books', () => {
  const ps = parseTskList('Ps 23', { book: JOHN, chapter: 3 }, lastVerse).refs[0]
  assert.deepEqual([ps.book, ps.chapter, ps.from, ps.to], [19, 23, 1, 50])
  const jude = parseTskList('Jude 5', { book: JOHN, chapter: 3 }, lastVerse).refs[0]
  assert.deepEqual([jude.book, jude.chapter, jude.from], [65, 1, 5])
})

test('TSK: ranges across chapters become two rows, margin notes and unknown books are skipped', () => {
  const { refs, skipped } = parseTskList('Ge 1:1-2:3; *marg: x; Zz 1:1', { book: JOHN, chapter: 3 }, lastVerse)
  assert.equal(refs.length, 2)
  assert.deepEqual([refs[1].chapter, refs[1].from, refs[1].to], [2, 1, 3])
  assert.deepEqual(skipped, ['Zz 1:1'])
})

test('TSK: entries pair each key phrase with the list that follows, ignoring chapter summaries', () => {
  const thml = '<br /><scripRef passage="Ge 1:1">1</scripRef> God creates;<br />\n<br />beginning.<br /><scripRef>Pr 8:22</scripRef><br />God.<br /><scripRef>Ex 20:11</scripRef>'
  assert.deepEqual(parseTskEntry(thml), [{ phrase: 'beginning', list: 'Pr 8:22' }, { phrase: 'God', list: 'Ex 20:11' }])
})

test('markupToText keeps paragraphs, drops tags, decodes entities', () => {
  assert.equal(markupToText('<p>One &amp; <i>two</i></p><p>three&nbsp;four</p>'), 'One & two\nthree four')
  assert.equal(titleCase("ABEL-BETH-MAACHAH"), 'Abel-Beth-Maachah')
})

test('commentary: SWORD range repeats merge into one passage; quoted Bible text is dropped', () => {
  const slot = (verse, ref) => ({ test: 'nt', book: 3, chapter: 3, verse, ref, text: 't' })
  const merged = mergeRanges([slot(0, 'a'), slot(1, 'b'), slot(2, 'b'), slot(3, 'b'), slot(4, 'c')])
  assert.deepEqual(merged.map((m) => [m.verse_start, m.verse_end]), [[0, 0], [1, 3], [4, 4]])
  const osis = '<div sID="1" type="x-p"/> <hi type="super">1</hi> There was a man <div eID="1" type="x-p"/> <div sID="2" type="x-p"/> Observe this. <div eID="2" type="x-p"/>'
  assert.equal(markupToText(stripQuotedScripture(osis)), 'Observe this.')
})

test("lexicons: Strong's Hebrew, Greek, the lexical index and Thayer's", () => {
  const xml = '<entry id="H1"><w pos="n-m" pron="awb" xlit="ʼâb" xml:lang="heb">אָב</w><source>a primitive word;</source><meaning><def>father</def>, in a literal sense</meaning><usage>chief.</usage></entry>'
  const [h] = parseStrongsHebrew(xml)
  assert.deepEqual([h.entry_id, h.gloss, h.derivation, h.usage, h.lang], ['H1', 'father', 'a primitive word;', 'chief.', 'heb'])
  const js = 'var d = {"G1":{"strongs_def":" a letter","derivation":"of Hebrew origin","translit":"A","lemma":"Α","kjv_def":"alpha"}}; module.exports = d;'
  assert.equal(parseStrongsGreek(js)[0].gloss, 'alpha')
  const li = parseLexicalIndex('<entry id="aaa"><w xlit="ʾāb">אָב</w> <def>father</def><xref bdb="a.ae.ab" strong="1" twot="4a"/></entry>')
  assert.deepEqual([...li.get('a.ae.ab').strongs], ['H1'])
  const t = parseThayer(['{"id":"G71","strongs":"G71","lemma":"ἄγω","text":"to lead","paragraphs":["to lead"]}', '{"id":"G71","strongs":"G71","lemma":"junk","text":"more","paragraphs":["more"]}'].join('\n'))
  assert.equal(t.length, 1)
  assert.equal(t[0].body, 'to lead\nmore')
})

test('dictionary rows: proper-case headwords, duplicate headwords disambiguated, headword title removed from the body', () => {
  const rows = toDictionaryRows([
    { key: 'AARON', body: '<entryFree n="Aaron"><title>Aaron</title><p>The eldest son.</p></entryFree>' },
    { key: 'ABEL', body: 'A shepherd' },
    { key: 'ABEL', body: 'A city' },
  ], { properName: (e) => /n="([^"]+)"/.exec(e.body)?.[1] ?? null })
  assert.deepEqual(rows.map((r) => r.headword), ['Aaron', 'Abel', 'Abel (2)'])
  assert.equal(rows[0].body, 'The eldest son.')
})

test('USFM: KJV, ASV, BSB and Darby markers are understood', () => {
  const usfm = [
    '\\id GEN', '\\c 1', '\\s1 The Beginning', '\\r (John 1:1)', '\\p',
    '\\v 1 ¶ In the \\w beginning|strong="H7225"\\w* God \\add was\\add* there.',
    '\\q1', '\\v 2 \\w God|strong="H430"\\w* \\f ° \\fr 1.2 \\ft Elohim\\f* spoke.',
    '\\qa ALEPH', '\\q1', '\\v 3 Done.',
  ].join('\n')
  const { verses, headings, notes } = parseUsfmBook(usfm, 'Gen')
  assert.equal(verses[0].text, 'In the beginning God was there.')
  assert.ok(verses[0].tokens.some((t) => t[0] === 'was' && (t[2] & 4)), 'supplied word is flagged')
  assert.deepEqual(headings.map((h) => [h.kind, h.text, h.before_verse]), [['ms', 'The Beginning', 1], ['ac', 'ALEPH', 3]])
  assert.equal(notes[0].text, 'Elohim')
  assert.equal(verses[1].poetry, 1)
})
