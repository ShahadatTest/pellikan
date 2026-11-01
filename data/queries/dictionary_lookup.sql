-- Dictionary headwords that start with :prefix (already lower-cased and accent-folded by the caller).
SELECT d.id, d.source_id, d.headword, substr(d.body, 1, 160) AS preview
FROM dictionary_entries d
WHERE substr(d.headword_norm, 1, length(:prefix)) = :prefix
ORDER BY d.headword_norm, d.source_id
LIMIT :limit
