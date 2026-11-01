// Dev-server twin of src-tauri/src/packs.rs, so translation packs work in `npm run dev` in a plain browser.
// Same rules: https only (or localhost), SHA-256 from the manifest, size caps, one translation per pack, install by
// rename. Packs live in data/build/installed/ (override with PELLIKAN_PACKS_DIR); the manifest URL is
// PELLIKAN_PACKS_URL or the same default the desktop app uses.
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const PACK_QUERIES = ['chapter_verses', 'chapter_headings', 'chapter_notes', 'search_verses', 'search_verses_count']
const DEFAULT_MANIFEST_URL = 'https://github.com/philorien/pellikan/releases/download/packs/manifest.json'
const MAX_DOWNLOAD = 150 * 1024 * 1024
const MAX_UNPACKED = 600 * 1024 * 1024

export interface ManifestEntry { id: string; name: string; bytes: number; sha256: string; url: string }

const dir = () => process.env.PELLIKAN_PACKS_DIR ?? resolve(process.cwd(), 'data/build/installed')
const manifestUrl = () => process.env.PELLIKAN_PACKS_URL ?? DEFAULT_MANIFEST_URL
export const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Z0-9_]{1,16}$/.test(id)

const open = new Map<string, DatabaseSync>()

function checkUrl(url: string) {
  const local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(url)
  if (!url.startsWith('https://') && !local) throw new Error(`refusing to download from ${url}: only https (or localhost) is allowed`)
}

async function get(url: string, max: number): Promise<Buffer> {
  checkUrl(url)
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!res.ok) throw new Error(`download failed (${url}): HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > max) throw new Error(`${url} is larger than the ${max / 1024 / 1024} MB limit`)
  return buf
}

export async function catalog(): Promise<ManifestEntry[]> {
  const m = JSON.parse((await get(manifestUrl(), 1024 * 1024)).toString('utf8'))
  if (m.version !== 1 || !Array.isArray(m.packs)) throw new Error('manifest is not valid or not supported by this app')
  for (const p of m.packs) {
    if (!validId(p.id) || !/^[0-9a-f]{64}$/i.test(p.sha256 ?? '') || !(p.bytes <= MAX_DOWNLOAD)) throw new Error(`manifest entry "${p.id}" is malformed`)
  }
  return m.packs
}

function resolveUrl(entryUrl: string) {
  if (/^https?:\/\//.test(entryUrl)) { checkUrl(entryUrl); return entryUrl }
  if (!entryUrl || entryUrl.startsWith('/') || entryUrl.includes('..')) throw new Error(`bad pack url "${entryUrl}"`)
  return manifestUrl().replace(/[^/]*$/, '') + entryUrl
}

function verify(path: string, id: string) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const check = (db.prepare('PRAGMA quick_check').get() as any).quick_check
    if (check !== 'ok') throw new Error(`the pack is damaged (${check})`)
    const named = (db.prepare("SELECT count(*) n FROM sources WHERE id = ? AND kind = 'translation'").get(id) as any).n
    const verses = (db.prepare('SELECT count(*) n FROM verses WHERE translation_id = ?').get(id) as any).n
    const strays = (db.prepare('SELECT count(*) n FROM verses WHERE translation_id <> ?').get(id) as any).n
    if (named !== 1 || verses < 1000 || strays !== 0) throw new Error(`the pack does not contain exactly the translation "${id}"`)
  } finally { db.close() }
}

export async function install(id: string) {
  if (!validId(id)) throw new Error(`"${id}" is not a valid translation id`)
  const entry = (await catalog()).find((p) => p.id === id)
  if (!entry) throw new Error(`"${id}" is not in the translation catalog`)
  const gz = await get(resolveUrl(entry.url), MAX_DOWNLOAD)
  if (createHash('sha256').update(gz).digest('hex') !== entry.sha256.toLowerCase()) throw new Error("the download does not match the catalog's checksum, so it was discarded")
  mkdirSync(dir(), { recursive: true })
  const tmp = resolve(dir(), `.${id}.installing`)
  try {
    writeFileSync(tmp, gunzipSync(gz, { maxOutputLength: MAX_UNPACKED }))
    verify(tmp, id)
    open.get(id)?.close(); open.delete(id)
    renameSync(tmp, resolve(dir(), `${id}.db`))
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}

export function remove(id: string) {
  if (!validId(id)) throw new Error(`"${id}" is not a valid translation id`)
  open.get(id)?.close(); open.delete(id)
  rmSync(resolve(dir(), `${id}.db`), { force: true })
}

export function installedIds(): string[] {
  if (!existsSync(dir())) return []
  return readdirSync(dir()).filter((f) => /^[A-Z0-9_]{1,16}\.db$/.test(f)).map((f) => f.slice(0, -3))
}

export function packDb(id: string): DatabaseSync | null {
  if (!validId(id) || !existsSync(resolve(dir(), `${id}.db`))) return null
  let db = open.get(id)
  if (!db) { db = new DatabaseSync(resolve(dir(), `${id}.db`), { readOnly: true }); open.set(id, db) }
  return db
}

export function installed() {
  const rows: unknown[] = []
  for (const id of installedIds()) {
    const db = packDb(id)
    if (db) rows.push(...db.prepare("SELECT id, name, kind, language, license, license_url, attribution, source_url, edition FROM sources WHERE kind = 'translation'").all())
  }
  return rows
}
