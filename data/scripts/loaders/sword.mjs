// Minimal readers for the three CrossWire SWORD module layouts Pellikan needs, read straight from CrossWire's
// "rawzip" packages (a zip holding mods.d/<name>.conf and the module files). No libsword, no GPL code: the formats
// are small and documented on the CrossWire wiki.
//
//   RawLD   uncompressed dictionary         (Smith's Bible Dictionary)
//   zLD     zlib-compressed dictionary      (Easton's Bible Dictionary)
//   zCom    zlib-compressed verse commentary, 10-byte verse index  (Treasury of Scripture Knowledge)
//   zCom4   same with a 12-byte verse index                         (Matthew Henry)
//
// All integers are little-endian.

import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { unzipSync } from 'fflate'

const td = new TextDecoder('utf-8')
const strict = new TextDecoder('utf-8', { fatal: true })
const cp1252 = new TextDecoder('windows-1252')
/** Some modules (Smith's) mix in Windows-1252 bytes such as a non-breaking space; decode those entries as 1252, not as U+FFFD. */
const decode = (bytes) => {
  try { return strict.decode(bytes) } catch { return cp1252.decode(bytes) }
}

/** Opens a rawzip package. Returns { files, conf } where files maps a path inside the zip to its bytes. */
export async function openModule(zipPath) {
  const files = unzipSync(new Uint8Array(await readFile(zipPath)))
  const confName = Object.keys(files).find((n) => /^mods\.d\/.+\.conf$/i.test(n))
  if (!confName) throw new Error(`${zipPath}: no mods.d/*.conf`)
  const conf = td.decode(files[confName])
  const get = (key) => new RegExp(`^${key}=(.*)$`, 'm').exec(conf)?.[1]?.trim()
  return {
    files,
    conf,
    driver: get('ModDrv'),
    dataPath: (get('DataPath') ?? '').replace(/^\.\//, '').replace(/\/+$/, ''),
    sourceType: get('SourceType'),
    license: get('DistributionLicense'),
    version: get('Version'),
  }
}

function file(mod, name) {
  const key = Object.keys(mod.files).find((n) => n === name || n.endsWith('/' + name) || n === name)
  if (!key) throw new Error(`module file not found: ${name}`)
  return mod.files[key]
}

const u32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | ((b[o + 3] << 24) >>> 0)
const u16 = (b, o) => b[o] | (b[o + 1] << 8)
// Dictionary keys end with CR LF or LF, and zLD keys carry trailing NULs in some modules.
const cleanKey = (s) => s.replace(/[\r\n\0]+$/g, '').trim()

/** RawLD: .idx = (offset u32, size u16) per entry; .dat entry = key, CRLF, body. */
export function readRawLD(mod) {
  const base = mod.dataPath.split('/').pop()
  const idx = file(mod, base + '.idx')
  const dat = file(mod, base + '.dat')
  const out = []
  for (let o = 0; o + 6 <= idx.length; o += 6) {
    const off = u32(idx, o)
    const size = u16(idx, o + 4)
    const text = decode(dat.subarray(off, off + size))
    const nl = text.indexOf('\n')
    out.push({ key: cleanKey(text.slice(0, nl < 0 ? text.length : nl)), body: nl < 0 ? '' : text.slice(nl + 1) })
  }
  return out
}

/** zLD: .idx = (offset u32, size u32) into .dat; a .dat entry = key, CRLF, block u32, entry u32. Blocks live in .zdt. */
export function readZLD(mod) {
  const base = mod.dataPath.split('/').pop()
  const idx = file(mod, base + '.idx')
  const dat = file(mod, base + '.dat')
  const zdx = file(mod, base + '.zdx')
  const zdt = file(mod, base + '.zdt')
  const blocks = new Map()
  const block = (n) => {
    let b = blocks.get(n)
    if (!b) {
      const start = u32(zdx, n * 8)
      const csize = u32(zdx, n * 8 + 4)
      b = inflateSync(zdt.subarray(start, start + csize))
      blocks.set(n, b)
    }
    return b
  }
  const out = []
  for (let o = 0; o + 8 <= idx.length; o += 8) {
    const off = u32(idx, o)
    const size = u32(idx, o + 4)
    const rec = dat.subarray(off, off + size)
    const keyLen = size - 8
    const key = cleanKey(decode(rec.subarray(0, keyLen)))
    const blockNo = u32(rec, keyLen)
    const entryNo = u32(rec, keyLen + 4)
    const b = block(blockNo)
    // Uncompressed block: entry count, then (offset u32, size u32) per entry, offsets measured from the block start.
    const entOff = u32(b, 4 + entryNo * 8)
    const entSize = u32(b, 4 + entryNo * 8 + 4)
    out.push({ key, body: decode(b.subarray(entOff, entOff + entSize)).replace(/\0+$/, '') })
  }
  return out
}

/**
 * zCom / zCom4: a verse commentary. Each testament has <ot|nt>.bzs (block table: offset, compressed size, size),
 * .bzv (one record per verse slot) and .bzz (the compressed blocks).
 *
 * `shape` is the versification as an array per testament of books, each an array of chapter verse-counts:
 *   shape.ot[bookIndex][chapterIndex] = number of verses
 * Slot layout per testament: 2 header slots, then for each book: 1 book intro slot, then per chapter 1 chapter
 * intro slot followed by that chapter's verses. Returns [{ test, book, chapter, verse, text, ref }] with 0-based book
 * index inside its testament and chapter/verse 0 meaning an introduction.
 */
export function readZCom(mod, shape) {
  const wide = mod.driver === 'zCom4'
  const rec = wide ? 12 : 10
  const dir = mod.dataPath
  const out = []
  for (const test of ['ot', 'nt']) {
    const bzs = file(mod, `${dir}/${test}.bzs`.replace(/^\/+/, ''))
    const bzv = file(mod, `${dir}/${test}.bzv`.replace(/^\/+/, ''))
    const bzz = file(mod, `${dir}/${test}.bzz`.replace(/^\/+/, ''))
    const blocks = new Map()
    const block = (n) => {
      let b = blocks.get(n)
      if (!b) {
        const off = u32(bzs, n * 12)
        const csize = u32(bzs, n * 12 + 4)
        b = inflateSync(bzz.subarray(off, off + csize))
        blocks.set(n, b)
      }
      return b
    }
    const read = (slot) => {
      const o = slot * rec
      if (o + rec > bzv.length) return ''
      const blockNo = u32(bzv, o)
      const start = u32(bzv, o + 4)
      const size = wide ? u32(bzv, o + 8) : u16(bzv, o + 8)
      if (!size) return null
      // `ref` identifies the stored text: SWORD points every verse of a range at the same bytes.
      return { ref: `${blockNo}:${start}:${size}`, text: decode(block(blockNo).subarray(start, start + size)).replace(/\0+$/, '') }
    }
    let slot = 2
    shape[test].forEach((chapters, book) => {
      const intro = read(slot++)
      if (intro?.text.trim()) out.push({ test, book, chapter: 0, verse: 0, ...intro })
      chapters.forEach((verses, ch) => {
        const cintro = read(slot++)
        if (cintro?.text.trim()) out.push({ test, book, chapter: ch + 1, verse: 0, ...cintro })
        for (let v = 1; v <= verses; v++) {
          const e = read(slot++)
          if (e?.text.trim()) out.push({ test, book, chapter: ch + 1, verse: v, ...e })
        }
      })
    })
    if (slot * rec !== bzv.length) throw new Error(`${mod.dataPath}/${test}: expected ${slot} verse slots, file has ${bzv.length / rec}`)
  }
  return out
}
