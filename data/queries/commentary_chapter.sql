-- All comments on one chapter, in reading order. verse_start 0 is the chapter introduction.
SELECT verse_start, verse_end, body
FROM commentary_entries
WHERE source_id = :source AND book_id = :book AND chapter = :chapter
ORDER BY verse_start
