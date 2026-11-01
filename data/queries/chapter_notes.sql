SELECT verse, seq, kind, text
FROM notes
WHERE translation_id = :translation AND book_id = :book AND chapter = :chapter
ORDER BY verse, seq
