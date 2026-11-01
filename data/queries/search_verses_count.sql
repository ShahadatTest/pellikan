SELECT count(*) AS total
FROM verses_fts
JOIN verses v ON v.id = verses_fts.rowid
WHERE verses_fts MATCH :q AND v.translation_id = :translation
