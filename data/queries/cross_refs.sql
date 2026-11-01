-- Cross-references from one verse, from one source ('OPENBIBLE' by votes, 'TSK' in the Treasury's own order), with
-- the text of the target passage in the chosen translation.
SELECT x.to_book_id, x.to_chapter, x.to_verse, x.to_verse_end, x.weight, x.note,
       (SELECT substr(group_concat(text, ' '), 1, 320)
          FROM (SELECT v.text FROM verses v
                WHERE v.translation_id = :translation AND v.book_id = x.to_book_id AND v.chapter = x.to_chapter
                  AND v.verse BETWEEN x.to_verse AND x.to_verse_end
                ORDER BY v.verse)) AS text
FROM cross_references x
WHERE x.source_id = :source AND x.book_id = :book AND x.chapter = :chapter AND x.verse = :verse
ORDER BY CASE WHEN x.source_id = 'OPENBIBLE' THEN -x.weight ELSE x.id END, x.id
LIMIT :limit
