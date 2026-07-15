import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = resolve(projectRoot, 'release')

await rm(releaseDir, { recursive: true, force: true })
console.log(`Cleaned ${releaseDir}`)
