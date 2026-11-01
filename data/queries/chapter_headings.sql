SELECT before_verse, kind, text
FROM headings
WHERE translation_id = :translation AND book_id = :book AND chapter = :chapter
ORDER BY before_verse, seq
