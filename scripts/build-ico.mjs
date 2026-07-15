/**
 * Build a multi-image ICO file from individual PNG files.
 * Embeds 16, 32, 48, 64, 128, 256 px PNG entries as required by Windows.
 * Usage: node scripts/build-ico.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const iconsDir = resolve(root, 'resources', 'icons')
const outPath = resolve(root, 'resources', 'icon.ico')

// ICO requires these sizes; 256 is stored as 0x00 in the directory byte field.
const SIZES = [16, 32, 48, 64, 128, 256]

const pngBuffers = await Promise.all(
  SIZES.map(async (s) => {
    const pngPath = resolve(iconsDir, `${s}x${s}.png`)
    const buf = await readFile(pngPath)
    return { size: s, buf }
  }),
)

// ICO format:
//   Header  : 6 bytes  (reserved=0, type=1, count=N)
//   Directory: N * 16 bytes
//   Image data: concatenated PNG blobs
const NUM = pngBuffers.length
const HEADER_SIZE = 6
const DIR_ENTRY_SIZE = 16
const DIR_SIZE = NUM * DIR_ENTRY_SIZE
const dataStart = HEADER_SIZE + DIR_SIZE

const totalSize = dataStart + pngBuffers.reduce((s, { buf }) => s + buf.length, 0)
const ico = Buffer.alloc(totalSize)

// Header
ico.writeUInt16LE(0, 0) // reserved
ico.writeUInt16LE(1, 2) // image type: ICO
ico.writeUInt16LE(NUM, 4) // number of images

let dirOffset = HEADER_SIZE
let imgOffset = dataStart

for (const { size, buf } of pngBuffers) {
  // Directory entry
  ico.writeUInt8(size === 256 ? 0 : size, dirOffset + 0) // width (0 = 256)
  ico.writeUInt8(size === 256 ? 0 : size, dirOffset + 1) // height
  ico.writeUInt8(0, dirOffset + 2) // color count (0 = no palette)
  ico.writeUInt8(0, dirOffset + 3) // reserved
  ico.writeUInt16LE(1, dirOffset + 4) // color planes
  ico.writeUInt16LE(32, dirOffset + 6) // bits per pixel
  ico.writeUInt32LE(buf.length, dirOffset + 8) // image data size
  ico.writeUInt32LE(imgOffset, dirOffset + 12) // offset to image data

  buf.copy(ico, imgOffset)
  imgOffset += buf.length
  dirOffset += DIR_ENTRY_SIZE
}

await writeFile(outPath, ico)
console.log(`✅  Wrote ${outPath} with ${NUM} images: ${SIZES.join(', ')} px`)
