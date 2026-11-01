//! Translation packs: Bible translations that are not built into `bible.db` and are downloaded on demand.
//!
//! A pack is a gzip-compressed SQLite file with the same schema as `bible.db` holding exactly one translation
//! (built by `npm run data:packs`). Installing one is a file operation: download, check the SHA-256 from the manifest,
//! unpack beside the others in `<app data>/translations/`, validate, rename into place. Nothing is merged into another
//! database, so removing a translation is deleting its file and a failed install leaves nothing half-written.
//!
//! The same named queries run against a pack's connection as against `bible.db` (see `PACK_QUERIES`).

use flate2::read::GzDecoder;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Upper bounds, so a wrong or hostile server cannot fill the disk or memory.
pub const MAX_DOWNLOAD: u64 = 150 * 1024 * 1024;
pub const MAX_UNPACKED: u64 = 600 * 1024 * 1024;
const MAX_MANIFEST: u64 = 1024 * 1024;

/// Where the manifest lives. Override at build time (`PELLIKAN_PACKS_URL=... cargo build`) or at run time with the
/// same environment variable. Plain `http` is accepted only for localhost, for testing.
pub const DEFAULT_MANIFEST_URL: &str = "https://github.com/philorien/pellikan/releases/download/packs/manifest.json";

/// Queries that only touch tables every pack contains, so they can run on a pack's own connection.
/// Queries that join `words`, lexicons or cross-references stay on `bible.db`.
pub const PACK_QUERIES: &[&str] = &["chapter_verses", "chapter_headings", "chapter_notes", "search_verses", "search_verses_count"];

pub fn manifest_url() -> String {
    std::env::var("PELLIKAN_PACKS_URL").ok().or_else(|| option_env!("PELLIKAN_PACKS_URL").map(String::from)).unwrap_or_else(|| DEFAULT_MANIFEST_URL.to_string())
}

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
pub struct ManifestEntry {
    pub id: String,
    pub name: String,
    pub bytes: u64,
    pub sha256: String,
    pub url: String,
}

#[derive(Deserialize)]
struct Manifest {
    version: u32,
    packs: Vec<ManifestEntry>,
}

/// Pack ids become file names, so they are limited to capitals, digits and underscores.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 16 && id.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn check_url(url: &str) -> Result<(), String> {
    let local = ["http://localhost", "http://127.0.0.1", "http://[::1]"].iter().any(|p| url.starts_with(p) && matches!(url.as_bytes().get(p.len()), None | Some(b':') | Some(b'/')));
    if url.starts_with("https://") || local {
        Ok(())
    } else {
        Err(format!("refusing to download from {url}: only https (or localhost) is allowed"))
    }
}

/// Resolves a manifest entry's `url`: absolute https, or relative to the manifest's own folder.
pub fn resolve_url(manifest_url: &str, entry_url: &str) -> Result<String, String> {
    if entry_url.starts_with("http://") || entry_url.starts_with("https://") {
        check_url(entry_url)?;
        return Ok(entry_url.to_string());
    }
    if entry_url.is_empty() || entry_url.starts_with('/') || entry_url.contains("..") {
        return Err(format!("bad pack url \"{entry_url}\""));
    }
    let base = manifest_url.rsplit_once('/').map(|(b, _)| b).ok_or("bad manifest url")?;
    Ok(format!("{base}/{entry_url}"))
}

fn http_get(url: &str, max: u64) -> Result<Vec<u8>, String> {
    check_url(url)?;
    let resp = ureq::get(url).timeout(Duration::from_secs(180)).call().map_err(|e| format!("download failed ({url}): {e}"))?;
    let mut buf = Vec::new();
    resp.into_reader().take(max + 1).read_to_end(&mut buf).map_err(|e| format!("download failed ({url}): {e}"))?;
    if buf.len() as u64 > max {
        return Err(format!("{url} is larger than the {} MB limit", max / 1024 / 1024));
    }
    Ok(buf)
}

pub fn parse_manifest(bytes: &[u8]) -> Result<Vec<ManifestEntry>, String> {
    let m: Manifest = serde_json::from_slice(bytes).map_err(|e| format!("manifest is not valid: {e}"))?;
    if m.version != 1 {
        return Err(format!("manifest version {} is not supported by this app", m.version));
    }
    for p in &m.packs {
        if !valid_id(&p.id) || p.sha256.len() != 64 || !p.sha256.chars().all(|c| c.is_ascii_hexdigit()) || p.bytes > MAX_DOWNLOAD {
            return Err(format!("manifest entry \"{}\" is malformed", p.id));
        }
    }
    Ok(m.packs)
}

pub fn fetch_manifest(url: &str) -> Result<Vec<ManifestEntry>, String> {
    parse_manifest(&http_get(url, MAX_MANIFEST)?)
}

/// Downloads and installs one pack. Returns the installed file's path.
pub fn download_and_install(dir: &Path, manifest_url: &str, id: &str) -> Result<PathBuf, String> {
    let entry = fetch_manifest(manifest_url)?.into_iter().find(|p| p.id == id).ok_or_else(|| format!("\"{id}\" is not in the translation catalog"))?;
    let gz = http_get(&resolve_url(manifest_url, &entry.url)?, MAX_DOWNLOAD)?;
    install_bytes(dir, id, &gz, &entry.sha256)
}

/// Checks a pack file is a real, complete, single-translation database for `id`.
pub fn verify_pack(path: &Path, id: &str) -> Result<(), String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| format!("not a database: {e}"))?;
    let check: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0)).map_err(|e| format!("not a database: {e}"))?;
    if check != "ok" {
        return Err(format!("the pack is damaged ({check})"));
    }
    let named: i64 = conn.query_row("SELECT count(*) FROM sources WHERE id = ?1 AND kind = 'translation'", [id], |r| r.get(0)).map_err(|e| format!("not a Pellikan pack: {e}"))?;
    let verses: i64 = conn.query_row("SELECT count(*) FROM verses WHERE translation_id = ?1", [id], |r| r.get(0)).map_err(|e| format!("not a Pellikan pack: {e}"))?;
    let strays: i64 = conn.query_row("SELECT count(*) FROM verses WHERE translation_id <> ?1", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if named != 1 || verses < 1000 || strays != 0 {
        return Err(format!("the pack does not contain exactly the translation \"{id}\""));
    }
    Ok(())
}

/// Verifies the hash, unpacks to a temporary file, validates it, then renames it into place.
pub fn install_bytes(dir: &Path, id: &str, gz: &[u8], expected_sha256: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err(format!("\"{id}\" is not a valid translation id"));
    }
    let actual = hex(&Sha256::digest(gz));
    if !actual.eq_ignore_ascii_case(expected_sha256) {
        return Err("the download does not match the catalog's checksum, so it was discarded".to_string());
    }
    fs::create_dir_all(dir).map_err(|e| format!("cannot create {dir:?}: {e}"))?;
    let tmp = dir.join(format!(".{id}.installing"));
    let result = (|| {
        let mut out = fs::File::create(&tmp).map_err(|e| format!("cannot write {tmp:?}: {e}"))?;
        let written = io::copy(&mut GzDecoder::new(gz).take(MAX_UNPACKED + 1), &mut out).map_err(|e| format!("the pack could not be unpacked: {e}"))?;
        if written > MAX_UNPACKED {
            return Err("the pack unpacks to more than the size limit".to_string());
        }
        drop(out);
        verify_pack(&tmp, id)?;
        let dest = dir.join(format!("{id}.db"));
        fs::rename(&tmp, &dest).map_err(|e| format!("cannot install {dest:?}: {e}"))?;
        Ok(dest)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

pub fn open_pack(path: &Path) -> Result<Connection, String> {
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|e| format!("cannot open {path:?}: {e}"))
}

/// Opens every valid `<ID>.db` in `dir`. A damaged file is skipped, not fatal: the app must still start.
pub fn scan(dir: &Path) -> Vec<(String, Connection)> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut out = Vec::new();
    for e in entries.flatten() {
        let path = e.path();
        let (Some(stem), Some("db")) = (path.file_stem().and_then(|s| s.to_str()), path.extension().and_then(|s| s.to_str())) else { continue };
        if !valid_id(stem) {
            continue;
        }
        match verify_pack(&path, stem).and_then(|_| open_pack(&path)) {
            Ok(conn) => out.push((stem.to_string(), conn)),
            Err(err) => eprintln!("skipping translation pack {path:?}: {err}"),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::GzEncoder, Compression};
    use std::io::Write;

    fn temp_dir(tag: &str) -> PathBuf {
        // Tests run in parallel inside one process, so every directory needs its own name.
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let d = std::env::temp_dir().join(format!("pellikan-packs-{tag}-{}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// Builds a tiny but valid pack: the real schema, one source row, one book, 1,200 verses.
    fn make_pack(id: &str, stray: bool) -> Vec<u8> {
        let dir = temp_dir(&format!("src-{id}-{stray}"));
        let path = dir.join("p.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(include_str!("../../data/schema/bible.sql")).unwrap();
        conn.execute("INSERT INTO sources (id,name,kind,language,license,attribution,source_url) VALUES (?1,'Test','translation','en','PD','x','x')", [id]).unwrap();
        conn.execute("INSERT INTO sources (id,name,kind,language,license,attribution,source_url) VALUES ('OTHER','Other','translation','en','PD','x','x')", []).unwrap();
        conn.execute("INSERT INTO books (id,osis,usfm,name,testament,chapters) VALUES (1,'Gen','GEN','Genesis','OT',1)", []).unwrap();
        for v in 1..=1200 {
            let t = if stray && v == 1200 { "OTHER" } else { id };
            conn.execute("INSERT INTO verses (translation_id,book_id,chapter,verse,text,tokens) VALUES (?1,1,1,?2,'In the beginning','[]')", rusqlite::params![t, v]).unwrap();
        }
        drop(conn);
        let raw = fs::read(&path).unwrap();
        let mut gz = GzEncoder::new(Vec::new(), Compression::fast());
        gz.write_all(&raw).unwrap();
        gz.finish().unwrap()
    }

    fn sha(b: &[u8]) -> String {
        hex(&Sha256::digest(b))
    }

    #[test]
    fn installs_a_valid_pack_and_it_answers_the_reader_queries() {
        let dir = temp_dir("ok");
        let gz = make_pack("TST", false);
        let path = install_bytes(&dir, "TST", &gz, &sha(&gz)).unwrap();
        assert!(path.ends_with("TST.db"));
        assert!(!dir.join(".TST.installing").exists());
        let conn = open_pack(&path).unwrap();
        let mut p = serde_json::Map::new();
        for (k, v) in [("translation", serde_json::json!("TST")), ("book", serde_json::json!(1)), ("chapter", serde_json::json!(1))] {
            p.insert(k.into(), v);
        }
        let rows = crate::db::run_named(&conn, "chapter_verses", &p).unwrap();
        assert_eq!(rows.len(), 1200);
        assert_eq!(scan(&dir).len(), 1);
    }

    #[test]
    fn rejects_a_wrong_checksum_and_leaves_nothing_behind() {
        let dir = temp_dir("sha");
        let gz = make_pack("TST", false);
        let err = install_bytes(&dir, "TST", &gz, &"0".repeat(64)).unwrap_err();
        assert!(err.contains("checksum"));
        assert!(fs::read_dir(&dir).unwrap().next().is_none());
    }

    #[test]
    fn rejects_unsafe_ids_garbage_and_packs_that_hold_another_translation() {
        let dir = temp_dir("bad");
        let gz = make_pack("TST", false);
        for id in ["../x", "tst", "", "A B", "TOOLONGTOOLONGTOOLONG"] {
            assert!(install_bytes(&dir, id, &gz, &sha(&gz)).is_err(), "{id}");
        }
        let junk = b"not gzip".to_vec();
        assert!(install_bytes(&dir, "TST", &junk, &sha(&junk)).is_err());
        let stray = make_pack("TST", true);
        assert!(install_bytes(&dir, "TST", &stray, &sha(&stray)).is_err(), "a pack with another translation's verses is refused");
        assert!(install_bytes(&dir, "OTHER", &gz, &sha(&gz)).is_err(), "a pack installed under the wrong id is refused");
        assert!(fs::read_dir(&dir).unwrap().next().is_none(), "failed installs clean up after themselves");
    }

    #[test]
    fn manifest_parsing_and_url_rules() {
        let ok = format!(r#"{{"version":1,"packs":[{{"id":"ASV","name":"ASV","bytes":10,"sha256":"{}","url":"ASV.db.gz"}}]}}"#, "a".repeat(64));
        assert_eq!(parse_manifest(ok.as_bytes()).unwrap()[0].id, "ASV");
        assert!(parse_manifest(br#"{"version":2,"packs":[]}"#).is_err());
        assert!(parse_manifest(br#"{"version":1,"packs":[{"id":"../x","name":"","bytes":1,"sha256":"","url":"x"}]}"#).is_err());
        assert_eq!(resolve_url("https://h/p/manifest.json", "ASV.db.gz").unwrap(), "https://h/p/ASV.db.gz");
        assert!(resolve_url("https://h/p/manifest.json", "../etc").is_err());
        assert!(resolve_url("https://h/p/manifest.json", "/etc/passwd").is_err());
        assert!(resolve_url("https://h/p/manifest.json", "http://evil.example/x").is_err());
        assert!(resolve_url("https://h/p/manifest.json", "http://localhost:8000/x").is_ok());
        assert!(check_url("http://localhost.evil.example/x").is_err());
    }
}
