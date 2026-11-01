-- Original-language words for an English chapter. Resolved through eng_chapter/eng_verse, so
-- Psalm titles, Joel 2/3, Malachi 3/4 and the other versification differences line up with the WEB.
SELECT id, eng_verse AS verse, position, lang, text, parts, trail, lemma, lemma_key, strongs,
       pos, morph, variant, chapter AS src_chapter, verse AS src_verse
FROM words
WHERE book_id = :book AND eng_chapter = :chapter
ORDER BY seq
