//! Named, read-only queries over the bundled reference database.
//!
//! The UI never sends SQL. It sends a query *name* plus parameters, and the SQL comes from `data/queries/*.sql`,
//! compiled into the binary with `include_str!`. The same files are used by the dev server (`nuxt dev`), so a query is
//! written once. Anything not in `QUERIES` is rejected.

use rusqlite::types::{ToSqlOutput, Value as SqlValue, ValueRef};
use rusqlite::Connection;
use serde_json::{Map, Value};

macro_rules! q {
    ($name:literal) => {
        ($name, include_str!(concat!("../../data/queries/", $name, ".sql")))
    };
}

/// Every file in data/queries must be listed here (data/scripts/check-db.mjs fails if one is missing).
pub const QUERIES: &[(&str, &str)] = &[
    q!("books"),
    q!("chapter_headings"),
    q!("chapter_notes"),
    q!("chapter_verses"),
    q!("chapter_words"),
    q!("commentary_chapter"),
    q!("cross_refs"),
    q!("dictionary_entry"),
    q!("dictionary_lookup"),
    q!("dictionary_search"),
    q!("lemma_info"),
    q!("lexicon_for_strongs"),
    q!("occurrences_by_form"),
    q!("occurrences_by_key"),
    q!("occurrences_by_strongs"),
    q!("search_verses"),
    q!("search_verses_count"),
    q!("sources"),
];

fn bind_value(v: &Value, key: &str) -> Result<ToSqlOutput<'static>, String> {
    match v {
        Value::Null => Ok(ToSqlOutput::Owned(SqlValue::Null)),
        Value::String(s) => Ok(ToSqlOutput::Owned(SqlValue::Text(s.clone()))),
        Value::Number(n) => match (n.as_i64(), n.as_f64()) {
            (Some(i), _) => Ok(ToSqlOutput::Owned(SqlValue::Integer(i))),
            (None, Some(f)) => Ok(ToSqlOutput::Owned(SqlValue::Real(f))),
            _ => Err(format!("Parameter \"{key}\" is not a usable number")),
        },
        _ => Err(format!("Parameter \"{key}\" must be a string, number or null")),
    }
}

fn cell(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        // The reference database has no BLOB columns; surface a marker instead of silently dropping data.
        ValueRef::Blob(_) => Value::String("<blob>".into()),
    }
}

/// Runs one named query and returns its rows as JSON objects keyed by column name.
pub fn run_named(conn: &Connection, name: &str, params: &Map<String, Value>) -> Result<Vec<Value>, String> {
    let sql = QUERIES
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, sql)| *sql)
        .ok_or_else(|| format!("Unknown query \"{name}\""))?;

    let mut stmt = conn.prepare(sql).map_err(|e| format!("{name}: {e}"))?;

    // Bind by the :names the SQL itself declares; a missing parameter is an error, never a silent NULL.
    for i in 1..=stmt.parameter_count() {
        let pname = stmt.parameter_name(i).ok_or_else(|| format!("{name}: positional parameters are not supported"))?;
        let key = pname.trim_start_matches([':', '@', '$']);
        let v = params.get(key).ok_or_else(|| format!("Missing parameter \"{key}\""))?;
        let bound = bind_value(v, key)?;
        stmt.raw_bind_parameter(i, bound).map_err(|e| format!("{name}: {e}"))?;
    }

    let cols: Vec<String> = stmt.column_names().iter().map(|c| c.to_string()).collect();
    let mut rows = stmt.raw_query();
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("{name}: {e}"))? {
        let mut obj = Map::with_capacity(cols.len());
        for (i, c) in cols.iter().enumerate() {
            obj.insert(c.clone(), cell(row.get_ref(i).map_err(|e| format!("{name}: {e}"))?));
        }
        out.push(Value::Object(obj));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn params(v: Value) -> Map<String, Value> {
        v.as_object().cloned().unwrap_or_default()
    }

    /// The real database, if it has been built (`npm run data`). Tests that need it skip with a message otherwise.
    fn real_db() -> Option<Connection> {
        let path = std::env::var("PELLIKAN_DB").unwrap_or_else(|_| "../data/build/bible.db".into());
        match Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) {
            Ok(c) => Some(c),
            Err(_) => {
                eprintln!("skipped: {path} not found");
                None
            }
        }
    }

    #[test]
    fn names_are_unique() {
        let mut names: Vec<_> = QUERIES.iter().map(|q| q.0).collect();
        names.sort();
        let n = names.len();
        names.dedup();
        assert_eq!(n, names.len());
    }

    #[test]
    fn rejects_unknown_query_and_missing_params() {
        let c = Connection::open_in_memory().unwrap();
        assert!(run_named(&c, "drop_everything", &params(json!({}))).unwrap_err().contains("Unknown query"));
        // Fails on the missing parameter before touching any table.
        let mem = Connection::open_in_memory().unwrap();
        mem.execute_batch("CREATE TABLE lemmas (lemma_key, lang, lemma, strongs, occurrences);").unwrap();
        assert!(run_named(&mem, "lemma_info", &params(json!({}))).unwrap_err().contains("Missing parameter \"key\""));
        assert!(run_named(&mem, "lemma_info", &params(json!({"key": [1]}))).unwrap_err().contains("must be a string"));
    }

    #[test]
    fn every_query_prepares_against_the_real_schema() {
        let Some(c) = real_db() else { return };
        for (name, sql) in QUERIES {
            c.prepare(sql).unwrap_or_else(|e| panic!("{name}: {e}"));
        }
    }

    #[test]
    fn reads_a_chapter_and_its_greek() {
        let Some(c) = real_db() else { return };
        let verses = run_named(&c, "chapter_verses", &params(json!({"translation": "WEB", "book": 43, "chapter": 3}))).unwrap();
        assert_eq!(verses.len(), 36);
        assert!(verses[15]["text"].as_str().unwrap().starts_with("For God so loved the world"));
        let words = run_named(&c, "chapter_words", &params(json!({"book": 43, "chapter": 3}))).unwrap();
        assert!(words.len() > 400);
        assert_eq!(words[0]["lang"], "grc");
    }

    #[test]
    fn hebrew_versification_resolves_to_english_numbers() {
        let Some(c) = real_db() else { return };
        let words = run_named(&c, "chapter_words", &params(json!({"book": 19, "chapter": 3}))).unwrap();
        // eng_verse 0 is the psalm title, and Psalm 3's title is six words.
        assert_eq!(words.iter().filter(|w| w["verse"] == 0).count(), 6);
    }

    #[test]
    fn search_returns_snippets_with_marker_characters() {
        let Some(c) = real_db() else { return };
        let q = "\"loved\" \"world\"";
        let total = run_named(&c, "search_verses_count", &params(json!({"q": q, "translation": "WEB"}))).unwrap();
        assert!(total[0]["total"].as_i64().unwrap() > 5);
        let hits = run_named(&c, "search_verses", &params(json!({"q": q, "translation": "WEB", "limit": 5, "offset": 0}))).unwrap();
        assert_eq!(hits.len(), 5);
        assert!(hits[0]["snippet"].as_str().unwrap().contains('\u{2}'));
    }

    #[test]
    fn sql_injection_through_parameters_is_just_text() {
        let Some(c) = real_db() else { return };
        let rows = run_named(&c, "lemma_info", &params(json!({"key": "x' OR '1'='1"}))).unwrap();
        assert!(rows.is_empty());
    }
}
