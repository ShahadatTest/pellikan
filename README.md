<p align="center">
  <img src="public/pellikan.svg" alt="Pellikan logo" width="240">
</p>

# Pellikan

A local-first Bible study app in the spirit of SWORD and Logos. Open source. Your notes, highlights and downloaded
texts live on your computer. Nothing about your reading is sent anywhere.

> **Status: early.** There is no installer to download yet. You run Pellikan by cloning this repository and building it
> (see [Install from GitHub](#install-from-github)). The desktop window has never been launched
> end to end; the Rust side compiles and its tests pass on macOS, and the interface has been checked in a browser.
> See [What has been tested](#what-has-been-tested) for exactly what that means.

## What it does

- **Read** with a passage picker, command palette (`Cmd/Ctrl+K`), browser-style tabs, adjustable text size, red-letter
  toggle, print, and light, dark or system themes.
- **Six translations offline.** WEB, BSB and KJV are built in. ASV, YLT and Darby download once from the Library page
  (3 to 7 MB each), are verified against a checksum, and then work offline. An ESV is possible if you supply your own
  licensed epub (see [DATA_SOURCES.md](DATA_SOURCES.md)).
- **Original languages.** The Hebrew, Aramaic and Greek words of the selected verse with decoded morphology, and every
  other place a word is used.
- **Lexicons.** Strong's, Brown-Driver-Briggs and Thayer's in Word Study.
- **Commentary and cross-references.** Matthew Henry beside the passage. Cross-references from OpenBible.info (ranked by
  votes) and the Treasury of Scripture Knowledge.
- **Dictionaries.** Easton's and Smith's, searchable.
- **Study guide, notes and highlights.** Section headings, footnotes and cross-references for the chapter; notes and
  four highlight colors per verse, with overview pages.
- **Full-text search** across the selected translation.

Not built yet: importing your own books (EPUB, PDF, DOCX), AI-assisted search, signed installers. See the
[roadmap](#roadmap).

## Install from GitHub

There are no prebuilt app downloads. The only release on GitHub, [`packs`](https://github.com/philorien/pellikan/releases/tag/packs),
holds the optional translation packs the app downloads for itself. **Do not download those by hand.** To use Pellikan,
build it from source.

### 1. Requirements

| Tool | Why | Check |
| --- | --- | --- |
| **Node 22.18 or newer** | The UI and the data scripts. The scripts use Node's built-in `node:sqlite` and run TypeScript directly. | `node -v` |
| **Rust** (stable) | Only for the desktop window | `rustc -V` |
| **Xcode Command Line Tools** (macOS) | Linker and the system web view | `xcode-select --install` |
| **About 600 MB of disk** | 100 MB of downloaded source texts and a 280 MB database | |
| **Network, once** | The data build downloads the source texts | |

Install Rust with `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`.

macOS is the only platform it has been built on. Linux and Windows should work with Tauri's usual prerequisites
([Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)) but have not been tried.

### 2. Get the code and build the data

```bash
git clone https://github.com/philorien/pellikan.git
cd pellikan
npm install
npm run data
```

`npm run data` downloads the public-domain and openly licensed source texts, builds `data/build/bible.db` (about 280 MB),
and runs 64 integrity checks. It prints a line per source so you can see what went in. If it finishes with
`All checks passed`, the data is good.

### 3. Run it

In a browser, no Rust needed:

```bash
npm run dev          # http://localhost:3000
```

As a desktop app:

```bash
npm run tauri:dev
```

**macOS note.** If the Rust build fails at link time with `tapi error: malformed file ... libSystem.B.tbd`, your
Command Line Tools ship a newer SDK than your Rust toolchain understands. Point the build at an older SDK:

```bash
ls /Library/Developer/CommandLineTools/SDKs/
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk npm run tauri:dev
```

### 4. Build an installer (optional)

```bash
npm run data:build:release     # rebuilds bible.db WITHOUT the ESV
npm run tauri:build
```

Use `data:build:release`, not `data:build`, for anything you will share. The installer bundles `data/build/bible.db`,
and a plain build includes the ESV if your epub is present, which you may not redistribute.

The result is **unsigned**. Running it on your own Mac is fine. To give it to other people you need an Apple Developer
ID to sign and notarize it, or macOS will warn them away.

### Getting the other translations

Open **Library**, find **Bible translations**, and press **Download** next to ASV, YLT or Darby. The app fetches the
list from this repository's `packs` release, downloads the file, checks its SHA-256, validates it, and stores it as one
file in your app data folder. **Remove** deletes that file. If you are offline, the page says so and everything you
already have keeps working.

To point the app at your own host instead, set `PELLIKAN_PACKS_URL` to a manifest URL (https only; plain `http` works
for localhost). Details are in [DATA_SOURCES.md](DATA_SOURCES.md#optional-translations-downloaded-on-demand).

## Commands

| Command | What it does |
| --- | --- |
| `npm run data` | Fetch sources, build `bible.db`, run the checks |
| `npm run data:fetch` / `data:build` / `data:check` | The three steps separately |
| `npm run data:build:release` | Build without the ESV, for installers |
| `npm run data:fetch -- --packs` then `npm run data:packs` | Build the downloadable translation packs into `data/build/packs/` |
| `npm run dev` | Browser dev server with a dev-only query API |
| `npm run tauri:dev` / `tauri:build` | Desktop app / installer |
| `npm test` | Node unit tests |
| `cd src-tauri && cargo test --lib` | Rust tests. Those that need data run against `data/build/bible.db` and silently pass if it is missing, so build it first |
| `npm run build` | Static site build |

## How it is built

- **Tauri 2** (Rust and the system web view) for the desktop shell.
- **Nuxt 4** as a single-page app (`ssr: false`), **Tailwind v4**, **lucide** icons.
- **SQLite with FTS5** for all data, compiled into the app (`rusqlite` bundled build).
- **Separate databases, by purpose.** `bible.db` is read-only and ships with the app. `user.db` is for your data.
  Downloaded translations are one read-only file each. Updating reference data can never touch yours.
- **The UI never sends SQL.** It names a query; Rust (or the dev server) runs the matching file from
  `data/queries/`. One copy of every query serves both.
- **Canonical verse numbering** is English (KJV) with the 66 OSIS book ids. Hebrew numbering is mapped to it, and every
  bundled translation is checked against it at build time.

```
app/                   Nuxt UI: pages, components, composables
shared/                Code shared by the data scripts and the UI: books, references, morphology, text
data/queries/*.sql     Every query the app runs
data/schema/           bible.sql (reference DB) and user.sql (user DB, idempotent)
data/scripts/          fetch, build, build-packs, check, translations catalog, and loaders/ for each source
server/                Dev-only API: queries and translation packs, for the browser dev server
src-tauri/             Rust shell: opens the databases, runs queries, installs translation packs
```

Notes, highlights, tabs and preferences currently live in the web view's `localStorage` (all behind
`app/composables/useUserData.ts` and `useTabs.ts`). `user.db` has its schema but the Rust side has no write commands
yet, so your notes are **not** in it. Clearing the app's web data clears them.

## What has been tested

Checked, with the commands that check it:

- **Data build** from the real upstream files. `npm run data:check` runs 64 checks: database integrity,
  verse counts, Hebrew and English chapters ending on the same verse, search ranking, every query preparing, and
  spot checks on the lexicons, commentary and cross-references.
- **30 Node unit tests** (`npm test`) covering the parsers and loaders.
- **11 Rust tests** (`cargo test --lib`, with `bible.db` built), including translation-pack installs: wrong checksum, unsafe ids, a pack
  holding another translation's verses, and URL rules. The Rust crate compiles on macOS.
- **In a real browser** (the dev server): reading, switching between BSB, KJV, WEB and a downloaded translation,
  Word Study lexicon entries, Matthew Henry, cross-references, the dictionary, and installing and removing a
  translation pack from the real `packs` release.

**Not verified:** the Tauri window itself (never launched), Windows and Linux, narrow phone-width layouts, and
accessibility with a screen reader. See [ACCESSIBILITY.md](ACCESSIBILITY.md) for the gaps found so far.

## Known limitations

Measured details are in [DATA_SOURCES.md](DATA_SOURCES.md). The ones that matter most:

- **English words are not clickable for Strong's numbers.** The tags in the WEB are unreliable for the Old Testament
  (measured), so word study goes through the Hebrew and Greek words.
- **Thayer's is OCR-derived** and the Treasury's references are parsed from its shorthand. Both can contain errors.
- **The WEB numbers the end of Romans differently** from the KJV (the doxology sits at Romans 14:24-26).
- **`bible.db` is large**, about 280 MB without the ESV. It compresses in an installer.
- **The Tauri content security policy is `null`.** Tighten it before adding any feature that handles API keys.
- Hebrew, Greek and English verse numbers are mapped, with a handful of documented exceptions.

## Roadmap

1. Launch and fix the Tauri window on macOS, then add CI that runs the Node and Rust tests.
2. Move notes, highlights and bookmarks into `user.db` (the schema is ready; it needs Rust write commands).
3. Import EPUB, PDF, DOCX and plain text into `user.db`, with Scripture references found and linked.
4. AI-assisted search and questions with a bring-your-own key (Anthropic or Gemini), keys in the OS keychain and never
   in a database. Every answer carries a plain notice: AI can summarize and cross-reference text, but it cannot
   discern what the Spirit is saying. It is a concordance with a mouth, not a teacher.
5. Fix the accessibility gaps listed in [ACCESSIBILITY.md](ACCESSIBILITY.md).
6. Signed and notarized macOS builds, then Windows and Linux.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). It covers the workflow, the rules that protect the licensing of the data,
and how to add a translation or a data source. [AGENTS.md](AGENTS.md) holds the same conventions in the short form
for AI coding agents. Accessibility problems are bugs: see [ACCESSIBILITY.md](ACCESSIBILITY.md).

## License

`package.json` declares the code as **MIT**. There is no `LICENSE` file in the repository yet, which means the terms
are not fully stated until one is added. The data is licensed separately and is not MIT: see
[DATA_SOURCES.md](DATA_SOURCES.md). The built database contains CC BY-SA material (MorphGNT and Strong's Greek), so
distributing it carries ShareAlike obligations. Every source's license and required credit line also appear in the
app on the **Credits** page.
