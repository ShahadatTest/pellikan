-- Full-text search. :q must come from toFtsQuery() in shared/text.ts (every term quoted).
-- snippet() marks hits with control characters 0x02 / 0x03 instead of HTML, so the UI can
-- highlight without ever using v-html.
SELECT v.book_id, v.chapter, v.verse,
       snippet(verses_fts, 0, char(2), char(3), '…', 18) AS snippet
FROM verses_fts
JOIN verses v ON v.id = verses_fts.rowid
WHERE verses_fts MATCH :q AND v.translation_id = :translation
ORDER BY bm25(verses_fts), v.book_id, v.chapter, v.verse
LIMIT :limit OFFSET :offset
