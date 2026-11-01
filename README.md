# Scriptorium

A modern, local-first Bible study app in the spirit of SWORD and Logos. Open source. "Scriptorium" is a working
name and can change.

**Status: early scaffold.** The reader, original-language word study, full-text search and credits page work. Uploads
and AI-assisted search are designed for but not built yet. See [What works](#what-works) for what has been tested.

## Stack

- **Tauri 2** (Rust + the system web view) for the desktop shell
- **Nuxt 4** as a single-page app (`ssr: false`), **Tailwind v4** for styling
- **SQLite** with FTS5 for all data, bundled into the app (`rusqlite`, bundled build)
- Two database files: `bible.db` (reference text, read-only, ships with the app) and `user.db` (notes, highlights,
  imported books; created in the app data folder). Updating the Bible data can never touch user data.

## Does it run on a Mac?

Yes. Tauri 2 targets macOS (Apple Silicon and Intel) and uses the built-in WKWebView, so there is no browser to
bundle and the app is small. What you need on the Mac:

1. **Xcode Command Line Tools:** `xcode-select --install`
2. **Rust:** `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. **Node 22.18 or newer.** The data scripts use Node's built-in `node:sqlite` and run TypeScript directly.

Honest caveat: this scaffold was built and tested on Linux. The Node side (data build, UI, tests) and the Rust
database layer are tested. **The Tauri shell itself has not been compiled yet**, because the build environment had no
webkit2gtk, and it has not been run on a Mac. Expect a first-run fix or two. Running it locally needs no Apple
account. Distributing it to other people does: you need an Apple Developer ID to sign and notarize, or macOS will warn
users away from the app.

## Setup

```bash
npm install
npm run data          # downloads ~41 MB of source texts, builds data/build/bible.db (~109 MB), runs checks
npm run tauri:dev     # desktop app with hot reload
```

No Rust yet? Everything except the desktop window works in a browser:

```bash
npm run dev           # http://localhost:3000, queries served by a small dev-only API route
```

Other commands: `npm test` (unit tests), `npm run data:check` (database checks), `npm run build` (static site),
`npm run tauri:build` (installer).

## Layout

```
app/                   Nuxt UI: reader, search, credits, study panel
shared/                Code used by both the data scripts and the UI: books, references, morphology decoding
data/queries/*.sql     Every query the app runs. One copy, used by Rust and by the dev server
data/schema/           bible.sql (reference DB) and user.sql (user DB, idempotent)
data/scripts/          fetch, build, check, and the loaders (WEB USFM, OSHB XML, MorphGNT)
src-tauri/             Rust shell: opens the databases, runs named queries
```

The UI never sends SQL. It names a query; Rust (or the dev server) runs the matching file from `data/queries/`.

## What works

Tested:
- Data build from the real upstream files: 31,103 WEB verses, 137,554 Greek words, 306,785 Hebrew and Aramaic words.
- 17 Node unit tests and 7 Rust tests for the database layer (against the real database).
- `npm run data:check`: integrity, every chapter ending on the same verse in Hebrew and English, search ranking,
  every query preparing, `user.sql` applying twice.
- The UI in a real browser (Chromium): reading, jump bar (`Rom 8:28`), verse study panel with decoded morphology,
  lexeme occurrences, footnotes, search with highlighting, credits.

Not yet verified: the Tauri window, macOS, dark mode appearance, narrow window sizes, accessibility beyond basics.

## Known limitations

See [DATA_SOURCES.md](DATA_SOURCES.md) for the measured details. The ones that matter most:

- English-word Strong's tags in the WEB are unreliable for the Old Testament, so English words are intentionally not
  clickable. Study goes through the Hebrew and Greek words.
- Hebrew and Greek verse numbering is mapped to English; a handful of verses are not (documented and checked).
- No lexicon yet, so no glosses or definitions.
- `bible.db` is about 109 MB. Fine for a desktop app, and it compresses well in the installer.
- The Tauri CSP is `null` for now. Tighten it before adding AI features that handle API keys.

## Roadmap

1. Lexicon loader (Strong's definitions and glosses, license check first)
2. Highlights, notes and bookmarks (schema is ready in `user.sql`)
3. Imports: EPUB, PDF, DOCX and plain text into `user.db`, with scripture references found and linked
4. AI-assisted search and questions with a bring-your-own key (Anthropic or Gemini), keys in the OS keychain,
   never in a database. Every AI answer carries a plain notice: AI can summarize and cross-reference text, but it
   cannot discern what the Spirit is saying. Treat it like a concordance with a mouth, not a teacher.
5. Signed and notarized macOS builds, Windows and Linux builds

## License

Code: choose one before publishing (MIT or Apache-2.0 are the usual picks). Data: see DATA_SOURCES.md. The built
database includes CC BY-SA material.
