-- Every lexicon entry (Strong's, BDB, Thayer's) attached to one Strong's number such as 'H1254' or 'G3056'.
SELECT e.id, e.source_id, s.name AS source_name, e.entry_id, e.lang, e.headword, e.translit, e.pron, e.pos,
       e.gloss, e.body, e.derivation, e.usage
FROM lexicon_links l
JOIN lexicon_entries e ON e.id = l.entry_pk
JOIN sources s ON s.id = e.source_id
WHERE l.strongs = :strongs
ORDER BY CASE e.source_id WHEN 'STRONGS_H' THEN 0 WHEN 'STRONGS_G' THEN 0 WHEN 'BDB' THEN 1 ELSE 2 END, e.entry_id
