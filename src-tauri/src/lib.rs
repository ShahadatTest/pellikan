mod db;

use rusqlite::{Connection, OpenFlags};
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

/// SQLite connections are not `Sync`, so each lives behind a Mutex. Queries are short; contention is not a concern.
struct AppState {
    bible: Mutex<Connection>,
    /// The user's own data (notes, highlights, imported books). Opened and migrated now; used by upcoming features.
    #[allow(dead_code)]
    user: Mutex<Connection>,
}

#[tauri::command]
fn query(state: State<'_, AppState>, name: String, params: Option<Map<String, Value>>) -> Result<Vec<Value>, String> {
    let conn = state.bible.lock().map_err(|_| "database lock poisoned".to_string())?;
    db::run_named(&conn, &name, &params.unwrap_or_default())
}

/// Finds the reference database: an explicit override, then the app bundle, then the dev build output.
fn find_bible_db(app: &tauri::App) -> Result<PathBuf, String> {
    let mut tried = Vec::new();
    if let Ok(p) = std::env::var("PELLIKAN_DB") {
        tried.push(PathBuf::from(p));
    }
    if let Ok(p) = app.path().resolve("bible.db", tauri::path::BaseDirectory::Resource) {
        tried.push(p);
    }
    tried.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../data/build/bible.db"));
    tried
        .iter()
        .find(|p| p.is_file())
        .cloned()
        .ok_or_else(|| format!("bible.db not found. Run `npm run data` first. Looked in: {tried:?}"))
}

fn open_user_db(app: &tauri::App) -> Result<Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {dir:?}: {e}"))?;
    let conn = Connection::open(dir.join("user.db")).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;").map_err(|e| e.to_string())?;
    // Idempotent: safe to run on every launch (see data/schema/user.sql).
    conn.execute_batch(include_str!("../../data/schema/user.sql")).map_err(|e| format!("user.db schema: {e}"))?;
    Ok(conn)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let bible_path = find_bible_db(app)?;
            let bible = Connection::open_with_flags(&bible_path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
                .map_err(|e| format!("cannot open {bible_path:?}: {e}"))?;
            let user = open_user_db(app)?;
            app.manage(AppState { bible: Mutex::new(bible), user: Mutex::new(user) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![query])
        .run(tauri::generate_context!())
        .expect("error while running Pellikan");
}
