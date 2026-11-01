-- Full-text search over dictionary headwords and entries. :q must come from toFtsQuery() in shared/text.ts.
-- snippet() marks hits with control characters 0x02 / 0x03 instead of HTML, as in search_verses.sql.
SELECT d.id, d.source_id, d.headword, snippet(dictionary_fts, 1, char(2), char(3), '…', 18) AS snippet
FROM dictionary_fts
JOIN dictionary_entries d ON d.id = dictionary_fts.rowid
WHERE dictionary_fts MATCH :q
ORDER BY bm25(dictionary_fts, 5.0, 1.0)
LIMIT :limit
