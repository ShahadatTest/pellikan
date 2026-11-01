-- Pellikan reference database. Built by data/scripts/build-db.mjs, opened READ-ONLY by the app.
-- Anything the user creates (notes, highlights, imported books) lives in user.sql, a separate
-- database file, so shipping new reference data can never touch it.
--
-- Schema version: 2

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

-- Every dataset in this database, with its license. Drives the in-app Credits page, so the
-- attribution requirements of CC BY / CC BY-SA sources are met from the data, not from memory.
CREATE TABLE sources (
  id          TEXT PRIMARY KEY,                 -- 'WEB', 'OSHB', 'SBLGNT', 'MORPHGNT'
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('translation', 'original-text', 'morphology', 'lexicon', 'dictionary', 'commentary', 'cross-references')),
  language    TEXT NOT NULL,                    -- BCP 47: 'en', 'he', 'grc'
  license     TEXT NOT NULL,
  license_url TEXT,
  attribution TEXT NOT NULL,                    -- required credit line
  source_url  TEXT NOT NULL,
  edition     TEXT                              -- version / date of the upstream data
) WITHOUT ROWID;

CREATE TABLE books (
  id        INTEGER PRIMARY KEY,                -- canonical order, 1..66
  osis      TEXT NOT NULL UNIQUE,               -- 'Gen', '1Sam', 'John'
  usfm      TEXT NOT NULL UNIQUE,               -- 'GEN', '1SA', 'JHN'
  name      TEXT NOT NULL,
  testament TEXT NOT NULL CHECK (testament IN ('OT', 'NT')),
  chapters  INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------------------------
-- Translations (WEB, BSB, KJV, ASV, YLT, Darby, and the ESV when the user supplies the epub)
-- ---------------------------------------------------------------------------------------------

CREATE TABLE verses (
  id             INTEGER PRIMARY KEY,
  translation_id TEXT    NOT NULL REFERENCES sources (id),
  book_id        INTEGER NOT NULL REFERENCES books (id),
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  text           TEXT    NOT NULL,              -- plain text; "\n" marks a poetic line break
  tokens         TEXT    NOT NULL,              -- JSON, see below
  para           INTEGER NOT NULL DEFAULT 0,    -- 1 = this verse starts a new paragraph / poetic line
  poetry         INTEGER NOT NULL DEFAULT 0,    -- 1 = verse is set as poetry
  UNIQUE (translation_id, book_id, chapter, verse)
);

-- tokens: JSON array of [text, strongs, flags, noteSeq?]
--   text    string to render ("\n" is a line break)
--   strongs Strong's number the translators tagged this English word with ('H1254', 'G3056'), or null
--   flags   bit 1 = words of Jesus, bit 2 = footnote/cross-reference marker (text is empty; noteSeq points at notes.seq),
--           bit 4 = words the translators supplied (italic in the KJV and ASV)
-- Joining every token's text reproduces verses.text exactly.

CREATE TABLE headings (
  id             INTEGER PRIMARY KEY,
  translation_id TEXT    NOT NULL REFERENCES sources (id),
  book_id        INTEGER NOT NULL REFERENCES books (id),
  chapter        INTEGER NOT NULL,
  before_verse   INTEGER NOT NULL,              -- shown above this verse
  seq            INTEGER NOT NULL,              -- order among headings sharing before_verse
  kind           TEXT    NOT NULL CHECK (kind IN ('ms', 'd', 'sp', 'ac')), -- section, psalm description, speaker, acrostic letter
  text           TEXT    NOT NULL
);
CREATE INDEX headings_ref ON headings (translation_id, book_id, chapter, before_verse, seq);

CREATE TABLE notes (
  id             INTEGER PRIMARY KEY,
  translation_id TEXT    NOT NULL REFERENCES sources (id),
  book_id        INTEGER NOT NULL REFERENCES books (id),
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  seq            INTEGER NOT NULL,              -- order within the verse; matches the token's noteSeq
  kind           TEXT    NOT NULL CHECK (kind IN ('footnote', 'xref')),
  text           TEXT    NOT NULL
);
CREATE INDEX notes_ref ON notes (translation_id, book_id, chapter, verse, seq);

-- Full-text search over translation text. External-content table: no duplicate copy of the text.
-- Porter stemming + accent folding, so "loved" finds "love" and "Cafe" finds "Café".
CREATE VIRTUAL TABLE verses_fts USING fts5 (
  text,
  content = 'verses',
  content_rowid = 'id',
  tokenize = 'porter unicode61 remove_diacritics 2'
);

-- ---------------------------------------------------------------------------------------------
-- Original languages (OSHB Hebrew/Aramaic, SBLGNT + MorphGNT Greek): one row per word
-- ---------------------------------------------------------------------------------------------

CREATE TABLE words (
  id          INTEGER PRIMARY KEY,
  source_id   TEXT    NOT NULL REFERENCES sources (id),
  lang        TEXT    NOT NULL CHECK (lang IN ('heb', 'arc', 'grc')),
  book_id     INTEGER NOT NULL REFERENCES books (id),
  seq         INTEGER NOT NULL,                 -- reading order within the book
  chapter     INTEGER NOT NULL,                 -- chapter:verse as numbered in the SOURCE text
  verse       INTEGER NOT NULL,
  eng_chapter INTEGER NOT NULL,                 -- chapter:verse in English (KJV/WEB) numbering. These differ
  eng_verse   INTEGER NOT NULL,                 --   for ~2,000 Hebrew verses (Psalm titles, Joel, Malachi...).
                                                --   eng_verse 0 = unnumbered psalm title. Always query by these.
  position    INTEGER NOT NULL,                 -- 1-based order within the source verse
  text        TEXT    NOT NULL,                 -- display form (Hebrew: pointed + accented, morphemes joined)
  parts       TEXT,                             -- Hebrew only: morphemes separated by '/', aligned with morph
  trail       TEXT,                             -- punctuation after the word: maqqef, sof pasuq, paseq
  search      TEXT    NOT NULL,                 -- normalized form (see shared/text.ts) for searching
  lemma       TEXT,                             -- dictionary form. Greek only until a lexicon is loaded
  lemma_key   TEXT    NOT NULL,                 -- groups all forms of one word: Greek lemma, or 'H1254a'
  strongs     TEXT,                             -- 'H1254' (no disambiguation letter). Hebrew/Aramaic from OSHB; Greek filled in
                                                --   at build time by matching the lemma against Strong's (see lexicon.mjs), NULL if ambiguous
  pos         TEXT,                             -- Greek part of speech code (MorphGNT)
  morph       TEXT    NOT NULL,                 -- raw morphology code; decoded in shared/morph.ts
  variant     TEXT CHECK (variant IN ('ketiv', 'qere')), -- written vs. read form. Hide 'qere' by default
  src_id      TEXT                              -- OSHB's stable word id, so annotations survive data updates
);
CREATE INDEX words_ref     ON words (book_id, eng_chapter, eng_verse, seq);
CREATE INDEX words_lemma   ON words (lemma_key);
CREATE INDEX words_strongs ON words (strongs);
CREATE INDEX words_search  ON words (search);

CREATE TABLE lemmas (
  lemma_key   TEXT PRIMARY KEY,
  lang        TEXT    NOT NULL,
  lemma       TEXT,
  strongs     TEXT,
  occurrences INTEGER NOT NULL                  -- counts written forms (ketiv), not qere duplicates
) WITHOUT ROWID;

-- Hebrew (WLC) verse numbers -> English (KJV) numbers, from OSHB's VerseMap.xml. Kept for reference
-- and for aligning other translations later; words.eng_* is already resolved from it.
CREATE TABLE versification_map (
  book_id     INTEGER NOT NULL REFERENCES books (id),
  src_chapter INTEGER NOT NULL,
  src_verse   INTEGER NOT NULL,
  eng_chapter INTEGER NOT NULL,
  eng_verse   INTEGER NOT NULL,
  partial     INTEGER NOT NULL DEFAULT 0,       -- 1 = only part of the verse moves (7 cases)
  PRIMARY KEY (book_id, src_chapter, src_verse, partial)
) WITHOUT ROWID;

-- ---------------------------------------------------------------------------------------------
-- Lexicons: Strong's (Hebrew and Greek), Brown-Driver-Briggs, Thayer's
-- ---------------------------------------------------------------------------------------------

CREATE TABLE lexicon_entries (
  id         INTEGER PRIMARY KEY,
  source_id  TEXT NOT NULL REFERENCES sources (id),
  entry_id   TEXT NOT NULL,                     -- the source's own id: 'H1254', 'G3056', BDB 'a.ab.ac', Thayer 'G3056'
  lang       TEXT NOT NULL CHECK (lang IN ('heb', 'arc', 'grc')),
  headword   TEXT NOT NULL,
  translit   TEXT,
  pron       TEXT,
  pos        TEXT,
  gloss      TEXT,                              -- short definition, one line
  body       TEXT NOT NULL,                     -- full entry as plain text; "\n" separates paragraphs
  derivation TEXT,                              -- Strong's: where the word comes from
  usage      TEXT,                              -- Strong's: how the KJV renders it
  UNIQUE (source_id, entry_id)
);

-- Which Strong's numbers an entry belongs to. Strong's entries link to themselves; BDB entries link through the Open
-- Scriptures lexical index; Thayer's through its own tagging (3,791 of 6,134 entries are tagged).
CREATE TABLE lexicon_links (
  strongs  TEXT    NOT NULL,                    -- 'H1254', 'G3056'
  entry_pk INTEGER NOT NULL REFERENCES lexicon_entries (id),
  PRIMARY KEY (strongs, entry_pk)
) WITHOUT ROWID;
CREATE INDEX lexicon_links_entry ON lexicon_links (entry_pk);

-- ---------------------------------------------------------------------------------------------
-- Dictionaries (Easton's, Smith's)
-- ---------------------------------------------------------------------------------------------

CREATE TABLE dictionary_entries (
  id            INTEGER PRIMARY KEY,
  source_id     TEXT NOT NULL REFERENCES sources (id),
  headword      TEXT NOT NULL,
  headword_norm TEXT NOT NULL,                  -- lower-cased, accents folded: lookup and prefix search
  body          TEXT NOT NULL,                  -- plain text; "\n" separates paragraphs
  UNIQUE (source_id, headword)
);
CREATE INDEX dictionary_norm ON dictionary_entries (headword_norm);

CREATE VIRTUAL TABLE dictionary_fts USING fts5 (
  headword, body,
  content = 'dictionary_entries',
  content_rowid = 'id',
  tokenize = 'porter unicode61 remove_diacritics 2'
);

-- ---------------------------------------------------------------------------------------------
-- Commentary (Matthew Henry)
-- ---------------------------------------------------------------------------------------------

CREATE TABLE commentary_entries (
  id          INTEGER PRIMARY KEY,
  source_id   TEXT    NOT NULL REFERENCES sources (id),
  book_id     INTEGER NOT NULL REFERENCES books (id),
  chapter     INTEGER NOT NULL,                 -- 0 = introduction to the whole book
  verse_start INTEGER NOT NULL,                 -- 0 = introduction to the chapter
  verse_end   INTEGER NOT NULL,                 -- the passage this comment covers; equal to verse_start for a single verse
  body        TEXT    NOT NULL                  -- plain text; "\n" separates paragraphs
);
CREATE INDEX commentary_ref ON commentary_entries (source_id, book_id, chapter, verse_start);

-- ---------------------------------------------------------------------------------------------
-- Cross-references (OpenBible.info, Treasury of Scripture Knowledge), English verse numbering
-- ---------------------------------------------------------------------------------------------

CREATE TABLE cross_references (
  id            INTEGER PRIMARY KEY,
  source_id     TEXT    NOT NULL REFERENCES sources (id),
  book_id       INTEGER NOT NULL REFERENCES books (id),
  chapter       INTEGER NOT NULL,
  verse         INTEGER NOT NULL,
  to_book_id    INTEGER NOT NULL REFERENCES books (id),
  to_chapter    INTEGER NOT NULL,
  to_verse      INTEGER NOT NULL,
  to_verse_end  INTEGER NOT NULL,               -- equal to to_verse for a single verse
  weight        INTEGER NOT NULL DEFAULT 0,     -- OpenBible: community votes (can be negative). TSK: 0
  note          TEXT                            -- TSK: the key phrase the reference supports
);
CREATE INDEX cross_ref_from ON cross_references (book_id, chapter, verse, source_id);
