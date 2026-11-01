-- Every verse using a Strong's number, across all disambiguated lexemes ('H1254' covers H1254a and H1254b).
SELECT w.book_id, w.eng_chapter AS chapter, w.eng_verse AS verse, w.text AS form, w.morph, w.pos, w.lang,
       v.text AS verse_text
FROM words w
LEFT JOIN verses v ON v.translation_id = :translation AND v.book_id = w.book_id
                  AND v.chapter = w.eng_chapter AND v.verse = w.eng_verse
WHERE w.strongs = :strongs AND (w.variant IS NULL OR w.variant = 'ketiv')
ORDER BY w.book_id, w.eng_chapter, w.eng_verse, w.seq
LIMIT :limit OFFSET :offset
