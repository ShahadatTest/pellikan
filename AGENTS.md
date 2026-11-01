# AGENTS.md

Guidance for AI coding agents working in Pellikan. Humans: see [README.md](README.md) for setup and status.

## What this is

A local-first, open source Bible study desktop app. Tauri 2 (Rust) shell, Nuxt 4 SPA (`ssr: false`), Tailwind v4,
SQLite with FTS5. Reference text lives in a read-only `bible.db`; user data goes in a separate `user.db`.

## Commands

```bash
npm install
npm run data          # fetch sources, build data/build/bible.db, run checks (needs network, ~41 MB)
npm run dev           # browser at localhost:3000, queries served by server/api/query/[name].post.ts
npm run tauri:dev     # desktop app (needs Rust and Xcode CLT on macOS)
npm test              # node:test unit tests for data loaders and shared/
npm run data:check    # database integrity checks
npm run build         # static site (nuxt generate)
```

Node >= 22.18 is required: the data scripts use `node:sqlite` and run TypeScript natively. `bible.db` must exist
before the UI shows anything; build it with `npm run data`.

## Layout

- `app/` Nuxt UI. `pages/` (read/[book]/[chapter], search, notes, highlights, library, credits), `components/`,
  `composables/` (`useBible`, `useTabs`, `useTheme`, `useUserData`), `utils/types.ts`.
- `shared/` TypeScript used by both the UI and the data scripts: books, reference parsing, morphology decoding, text.
- `data/queries/*.sql` every query the app runs. **Single source of truth** for Rust and the dev server.
- `data/schema/` `bible.sql` (reference DB) and `user.sql` (user DB, idempotent).
- `data/scripts/` fetch, build, check, and `loaders/` (WEB USFM, OSHB XML, MorphGNT, optional ESV epub).
- `server/` dev-only API route and DB helper.
- `src-tauri/src/` `db.rs`, `lib.rs`, `main.rs`: opens both DBs, exposes a `query` command.
- `.agents/skills/` design skills (Impeccable). Not app code.

## Conventions and invariants

- **The UI never sends SQL.** It calls a named query; the backend runs `data/queries/<name>.sql`. To add a query,
  add the file and make sure `data:check` prepares it. Keep parameters named and validate the name against the
  allowlist, never build paths from raw input.
- **Two databases, never mixed.** Do not write to `bible.db`. User data (notes, highlights, bookmarks, imports,
  settings) belongs in `user.db`.
- **Current reality:** notes, highlights, tabs and prefs are in `localStorage` via `useUserData.ts` and `useTabs.ts`,
  because Rust has no write commands yet. Keep all access behind those composables so migrating is a one-file change.
- **References** use canonical book ids 1..66, OSIS ids in routes (`/read/Rom/8`), and English verse numbering.
  Use `shared/books.ts` and `shared/reference.ts`; do not re-implement parsing.
- **English words are intentionally not clickable.** WEB Strong's tags on English words are unreliable in the OT
  (measured, see DATA_SOURCES.md). Word study goes through the Hebrew and Greek words.
- **Secrets:** AI provider API keys, when added, go in the OS keychain, never a database or `localStorage`. Tighten
  the Tauri CSP (currently `null`) before any AI feature ships.
- **Licensing is a hard constraint.** `data/sources/` and `data/build/` are git-ignored on purpose. Never commit the
  ESV epub or a database that contains it. Do not add a data source without recording its license in
  DATA_SOURCES.md. The built DB includes CC BY-SA (MorphGNT) material.
- **Do not edit generated or ignored output:** `.nuxt/`, `.output/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/`.
- Update the Credits/`sources` data (via `build-db.mjs` and DATA_SOURCES.md) when sources change.

## Style

- Vue 3 `<script setup lang="ts">`, Tailwind utility classes using the theme tokens in `app/assets/css/main.css`
  (`bg-surface`, `text-muted`, `border-line`, `text-accent`). Icons from `lucide-vue-next`.
- Support light and dark themes; check both when touching colors.
- Prose and docs: plain, no marketing tone, no em dashes. State what was and was not verified.

## Verification

- Data or loader changes: `npm test` and `npm run data:check`.
- UI changes: run `npm run dev` and exercise the page in a browser. Type checks passing is not the same as the
  feature working.
- The Tauri shell has never been compiled or run on this project's target Mac. Say so rather than claiming it works.
- Rust: `cd src-tauri && cargo test` (tests run against the real `bible.db`).
