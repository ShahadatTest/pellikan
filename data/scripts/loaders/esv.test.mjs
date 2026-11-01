// Tests for the ESV epub parser using SYNTHETIC markup shaped like the Crossway epub. No ESV text is stored in the repo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseEsvTextFile } from './esv.mjs'

const page = (body, hidden = '') => `<html><body><section epub:type="chapter">${body}</section>${hidden ? `<section class="hidden">${hidden}</section>` : ''}</body></html>`
const fn = (id, text) => `<span id="${id}" class="footnote-popup"><span class="footnote-ref">1:1</span> ${text}</span></span>`
const marker = (kind, id) => kind === 'p'
  ? `<span class="footnote">&#160;<a class="pop-link" id="b${id}" onclick="return nav.show('p${id}',event);">[1]</a></span>`
  : `<span class="crossref"><small>&#160;</small><a class="pop-link" onclick="return nav.show('r${id}',event);">a</a><small>&#160;</small></span>`

test('prose verse, heading, words of Christ, footnote marker, deduped xrefs', () => {
  const html = page(
    `<header><p id="v43003001" class="heading"><span>A Heading</span></p></header>
     <p class="no-indent"><span class="h43003001"> <span class="book-name"><a onclick="return nav.show(43,event);">JOHN</a></span><span class="chapter-num"> 3 </span>${marker('r', '43003001.a')}First <span class="woc">spoken words</span>${marker('p', '43003001.1')}.</span><span class="h43003002"><span id="v43003002" class="verse-num"><a onclick="return nav.show('tc',event);">2</a></span>Second L<span class="smallcap">ORD</span>.</span></p>`,
    `<p class="note"><span><a>John 3:1 [1]</a> ${fn('p43003001.1', 'Or <em>another way</em>')}</p>
     <p class="crossref"><span><span id="r43003001.a" class="crossref-popup"><span class="crossref-verse"><a>3:1</a></span> <span class="crossref-letter"><a>a</a></span> <a href="b01.00.Genesis.text.xhtml#v01001001">Gen. 1:1</a>; <a href="b01.00.Genesis.text.xhtml#v01001001">Gen. 1:1</a>, <a href="b01.00.Genesis.text.xhtml#v01001003">3–5</a></span></span></p>`,
  )
  const acc = parseEsvTextFile(html, new Map())
  const v1 = acc.get('43003001'), v2 = acc.get('43003002')
  assert.equal(v1.tokens.map((t) => t[0]).join('').trim(), 'First spoken words.')
  assert.ok(v1.tokens.some((t) => t[2] === 1 && t[0] === 'spoken words'), 'words of Christ flagged')
  assert.deepEqual(v1.headings, [{ kind: 'ms', text: 'A Heading' }])
  assert.deepEqual(v1.notes.map((n) => [n.kind, n.text]), [['xref', 'Genesis 1:1'], ['xref', 'Genesis 1:3\u20135'], ['footnote', 'Or another way']])
  assert.equal(v1.tokens.find((t) => t[2] & 2)[3], 3, 'marker points at its note seq')
  assert.equal(v2.tokens.map((t) => t[0]).join(''), 'Second LORD.')
})

test('a stale line class at a chapter start does not swallow the verse', () => {
  const html = page(
    `<p class="line"><span><span class="h20010032">last line of 10:32</span></span></p>
     <p class="line"><span><span class="h20010032"><span class="book-name">PROVERBS</span><span id="v20011001" class="chapter-num"> 11 </span>First line of 11:1,</span></span></p>
     <p class="line-indent"><span><span class="h20010032">second line of 11:1</span></span></p>`,
  )
  const acc = parseEsvTextFile(html, new Map())
  assert.equal(acc.get('20010032').tokens.map((t) => t[0]).join(''), 'last line of 10:32')
  const v = acc.get('20011001')
  assert.equal(v.tokens.map((t) => t[0]).join('').trim(), 'First line of 11:1,\nsecond line of 11:1')
  assert.equal(v.poetry, 1)
})

test('heading ids and paragraph ids start verses whose spans carry no usable class', () => {
  const html = page(
    `<p class="line"><span><span class="h19119008">end of 8</span></span></p>
     <p id="v19119009" class="psalm-acrostic-title">Beth</p>
     <p class="line"><span> <span class="verse-num"><a>9</a></span> nine</span></p>
     <p class="normal" id="v19120001"><span class="h19119176"><span class="chapter-num"> 36 </span>thirty-six</span></p>`,
  )
  const acc = parseEsvTextFile(html, new Map())
  assert.equal(acc.get('19119009').tokens.map((t) => t[0]).join('').trim(), 'nine')
  assert.deepEqual(acc.get('19119009').headings, [{ kind: 'd', text: 'Beth' }])
  assert.equal(acc.get('19120001').tokens.map((t) => t[0]).join('').trim(), 'thirty-six')
  assert.equal(acc.get('19119008').tokens.map((t) => t[0]).join(''), 'end of 8')
})
