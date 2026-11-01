-- Every verse using one lexeme (a Greek lemma, or a Hebrew key such as 'H1254a').
SELECT w.book_id, w.eng_chapter AS chapter, w.eng_verse AS verse, w.text AS form, w.morph, w.pos, w.lang,
       v.text AS verse_text
FROM words w
LEFT JOIN verses v ON v.translation_id = :translation AND v.book_id = w.book_id
                  AND v.chapter = w.eng_chapter AND v.verse = w.eng_verse
WHERE w.lemma_key = :key AND (w.variant IS NULL OR w.variant = 'ketiv')
ORDER BY w.book_id, w.eng_chapter, w.eng_verse, w.seq
LIMIT :limit OFFSET :offset
