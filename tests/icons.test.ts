/**
 * Icon asset tests.
 * Validates ICO directory entries, PNG dimensions, and ICNS chunk coverage.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '..')
const ICONS_DIR = resolve(ROOT, 'resources', 'icons')
const ICO_PATH = resolve(ROOT, 'resources', 'icon.ico')
const ICNS_PATH = resolve(ROOT, 'resources', 'icon.icns')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePngDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG signature: 8 bytes, then IHDR chunk: 4(len)+4(type)+13(data)
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buf.subarray(0, 8).equals(PNG_SIG)) return null
  // IHDR data starts at offset 16
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  return { width, height }
}

interface IcoEntry {
  width: number
  height: number
  bpp: number
  dataSize: number
  dataOffset: number
}

function parseIcoDirectory(buf: Buffer): IcoEntry[] {
  const reserved = buf.readUInt16LE(0)
  const type = buf.readUInt16LE(2)
  const count = buf.readUInt16LE(4)
  if (reserved !== 0 || type !== 1) throw new Error('Not a valid ICO file')
  const entries: IcoEntry[] = []
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16
    const rawW = buf.readUInt8(o + 0)
    const rawH = buf.readUInt8(o + 1)
    const bpp = buf.readUInt16LE(o + 6)
    const dataSize = buf.readUInt32LE(o + 8)
    const dataOffset = buf.readUInt32LE(o + 12)
    entries.push({
      width: rawW === 0 ? 256 : rawW,
      height: rawH === 0 ? 256 : rawH,
      bpp,
      dataSize,
      dataOffset,
    })
  }
  return entries
}

interface IcnsChunk {
  type: string
  length: number
}

function parseIcnsChunks(buf: Buffer): IcnsChunk[] {
  const magic = buf.subarray(0, 4).toString('ascii')
  if (magic !== 'icns') throw new Error('Not a valid ICNS file')
  const chunks: IcnsChunk[] = []
  let offset = 8 // skip 'icns' magic + file length
  while (offset < buf.length) {
    if (offset + 8 > buf.length) break
    const type = buf.subarray(offset, offset + 4).toString('ascii')
    const length = buf.readUInt32BE(offset + 4)
    if (length < 8) break
    chunks.push({ type, length })
    offset += length
  }
  return chunks
}

// ---------------------------------------------------------------------------
// PNG dimension tests
// ---------------------------------------------------------------------------

describe('resources/icons PNG files', () => {
  const REQUIRED_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]

  it('has PNG files for all required sizes', () => {
    const files = readdirSync(ICONS_DIR).filter((f) => f.endsWith('.png'))
    const available = files.map((f) => parseInt(f.split('x')[0], 10)).filter(Number.isFinite)
    for (const sz of REQUIRED_SIZES) {
      expect(available, `missing ${sz}x${sz}.png`).toContain(sz)
    }
  })

  it.each(REQUIRED_SIZES)('%ix%i.png has correct dimensions', (size) => {
    const buf = readFileSync(resolve(ICONS_DIR, `${size}x${size}.png`))
    const dims = parsePngDimensions(buf)
    expect(dims, `failed to parse ${size}x${size}.png`).not.toBeNull()
    expect(dims!.width).toBe(size)
    expect(dims!.height).toBe(size)
  })
})

// ---------------------------------------------------------------------------
// ICO directory tests
// ---------------------------------------------------------------------------

describe('resources/icon.ico', () => {
  const REQUIRED_ICO_SIZES = [16, 32, 48, 64, 128, 256]

  let entries: IcoEntry[]
  it('is a valid ICO file', () => {
    const buf = readFileSync(ICO_PATH)
    entries = parseIcoDirectory(buf)
    expect(entries.length).toBeGreaterThan(0)
  })

  it.each(REQUIRED_ICO_SIZES)('contains a %ix%i entry', (size) => {
    const buf = readFileSync(ICO_PATH)
    const ents = parseIcoDirectory(buf)
    const found = ents.find((e) => e.width === size && e.height === size)
    expect(found, `missing ${size}x${size} entry in ICO`).toBeDefined()
  })

  it('each ICO entry embeds a valid PNG payload', () => {
    const buf = readFileSync(ICO_PATH)
    const ents = parseIcoDirectory(buf)
    for (const e of ents) {
      const payload = buf.subarray(e.dataOffset, e.dataOffset + e.dataSize)
      const dims = parsePngDimensions(payload)
      expect(dims, `entry ${e.width}x${e.height}: payload is not PNG`).not.toBeNull()
      expect(dims!.width).toBe(e.width)
      expect(dims!.height).toBe(e.height)
    }
  })

  it('has exactly 6 required entries', () => {
    const buf = readFileSync(ICO_PATH)
    const ents = parseIcoDirectory(buf)
    expect(ents.length).toBe(REQUIRED_ICO_SIZES.length)
  })
})

// ---------------------------------------------------------------------------
// ICNS chunk tests
// ---------------------------------------------------------------------------

describe('resources/icon.icns', () => {
  // Modern Apple icon chunks that cover standard display sizes
  const REQUIRED_CHUNKS = [
    'ic07', // 128x128
    'ic08', // 256x256
    'ic09', // 512x512
    'ic10', // 1024x1024
  ]

  it('is a valid ICNS file', () => {
    const buf = readFileSync(ICNS_PATH)
    expect(() => parseIcnsChunks(buf)).not.toThrow()
    const chunks = parseIcnsChunks(buf)
    expect(chunks.length).toBeGreaterThan(0)
  })

  it.each(REQUIRED_CHUNKS)('contains chunk %s', (chunkType) => {
    const buf = readFileSync(ICNS_PATH)
    const chunks = parseIcnsChunks(buf)
    const types = chunks.map((c) => c.type)
    expect(types, `missing ICNS chunk ${chunkType}`).toContain(chunkType)
  })

  it('file length header matches actual file size', () => {
    const buf = readFileSync(ICNS_PATH)
    const headerLen = buf.readUInt32BE(4)
    expect(headerLen).toBe(buf.length)
  })
})
