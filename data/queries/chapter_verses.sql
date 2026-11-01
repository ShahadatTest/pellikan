SELECT verse, text, tokens, para, poetry
FROM verses
WHERE translation_id = :translation AND book_id = :book AND chapter = :chapter
ORDER BY verse
