# Data sources, licenses and known data issues

Scriptorium bundles data from the projects below. `npm run data:fetch` downloads it from the upstream hosts into
`data/sources/` (git-ignored), and writes `data/sources/SOURCES.lock.json` with the URL and SHA-256 of every file, so a
build can state exactly which bytes it came from. The in-app Credits page is generated from the `sources` table in
`bible.db`, which `data/scripts/build-db.mjs` fills from the text in this file's tables.

I am not a lawyer. Verify each license against the upstream project before you distribute a build.

| Layer | Project | License | Notes |
| --- | --- | --- | --- |
| English text | World English Bible (ebible.org) | Public domain | The name "World English Bible" is a trademark of eBible.org. Do not use that name for a modified text. |
| Hebrew text | Westminster Leningrad Codex via OSHB | Public domain (text) | |
| Hebrew lemmas and morphology | Open Scriptures Hebrew Bible | CC BY 4.0 | Attribution required. |
| Greek text | SBL Greek New Testament | CC BY 4.0 per ebible.org | The MorphGNT README still cites the older SBLGNT EULA. Confirm the current terms before shipping. |
| Greek morphology and lemmas | MorphGNT | CC BY-SA 3.0 | ShareAlike. See below. |

## The ShareAlike question

MorphGNT's tagging is CC BY-SA 3.0. The built `bible.db` contains that tagging, so distributing the database means
distributing ShareAlike material, and the database (or at least that layer) should go out under CC BY-SA 3.0 or a
compatible license, with attribution. The application code is separate and can carry whatever license you choose, as
long as the data stays clearly separated and labelled. Whether combining the layers in one file makes the whole file
a single adaptation is a legal gray area. If it matters for your plans, ask a lawyer, or build a variant database
without the Greek tagging.

SWORD modules and the `libsword` library are GPL. Scriptorium does not link or ship either, so the GPL does not
apply here. If you ever add SWORD module import, keep that code behind a clear boundary and re-check the license.

## Known data issues (measured, not guessed)

**1. The WEB's Strong's numbers on English words are not trustworthy in the Old Testament.** The tags in the
eBible USFM are not aligned to the word they sit on. Measured against OSHB: "God" (Elohim, H430) is tagged H3068
(YHWH) 1,252 times and H430 is not even in the top five. 95% of tags name a number that exists *somewhere* in the same
Hebrew verse, which is why it looks fine at a glance. The New Testament tags look much better (G2316 for "God" in 97%
of uses). For this reason the UI does not make English words clickable. Word study goes through the verse's Hebrew
and Greek words (OSHB and MorphGNT), which are reliable. The tags stay in `verses.tokens` for a future validated
alignment.

**2. Hebrew verse numbering differs from English.** About 2,000 verses (Psalm titles, Joel 2/3, Malachi 3/4, and
others). OSHB's `VerseMap.xml` is applied, so `words.eng_chapter` and `words.eng_verse` use English numbering. Always
query by those columns. Psalm titles that English Bibles leave unnumbered get `eng_verse = 0`.
Seven verses are only partly renumbered upstream (`type="partial"`). OSHB gives no word-level split point, so
they are left where the Hebrew puts them and recorded in `versification_map` with `partial = 1`. This is the
reason Ps 13:5 and Isa 64:1 have no Hebrew words.

**3. The Greek NT differs from English numbering in five places.** Fixed by an explicit table in
`data/scripts/loaders/morphgnt.mjs` (`NT_RENUMBER`): Acts 19:40/41, 2 Cor 13:12-14, 3 John 14/15, Rev 12:18/13:1.
`check-db.mjs` fails if a new mismatch appears.

**4. Passages the SBLGNT leaves out of the main text have no Greek words.** These are John 7:53 to 8:11, the
Romans 16 doxology (the WEB prints it at Rom 14:24-26), and verses found only in later manuscripts, such as Matt 17:21,
Matt 18:11 and Acts 8:37. The WEB includes them, so they show English text and a note in the study panel. This is a
textual choice, not a bug. `check-db.mjs` prints the full list (34 verses today).

**5. Neh 7:68** exists in the WEB but not in the Hebrew text.

**6. Hebrew `lemma` text is empty.** OSHB provides Strong's-style lemma numbers, not lemma spellings. Hebrew words
carry `lemma_key` (such as `H1254a`) and `strongs`. Lemma text and glosses need a lexicon loader (Open Scriptures
has one; check its license first). Greek has lemma text but no Strong's numbers, for the same reason in reverse.

**7. Source tracking.** `fetch.mjs` follows each project's default branch, so a re-fetch can pull newer data.
Pin to commit SHAs in `fetch.mjs` if you need byte-for-byte reproducible builds.
