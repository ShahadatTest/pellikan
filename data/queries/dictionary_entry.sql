SELECT d.id, d.source_id, s.name AS source_name, d.headword, d.body
FROM dictionary_entries d
JOIN sources s ON s.id = d.source_id
WHERE d.id = :id
