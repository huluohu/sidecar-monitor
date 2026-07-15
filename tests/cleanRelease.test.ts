import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceScript = join(repositoryRoot, 'scripts', 'clean-release.mjs')

let testRoot: string

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), 'sidecar-monitor-clean-release-'))
  mkdirSync(join(testRoot, 'scripts'))
  cpSync(sourceScript, join(testRoot, 'scripts', 'clean-release.mjs'))
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

function runCleanScript() {
  return spawnSync(process.execPath, [join(testRoot, 'scripts', 'clean-release.mjs')], {
    cwd: tmpdir(),
    encoding: 'utf8',
  })
}

describe('clean-release script', () => {
  it('removes the complete release directory without touching sibling files', () => {
    const releaseDir = join(testRoot, 'release')
    mkdirSync(join(releaseDir, 'nested'), { recursive: true })
    writeFileSync(join(releaseDir, 'old.dmg'), 'old')
    writeFileSync(join(releaseDir, 'nested', 'old.zip'), 'old')
    writeFileSync(join(testRoot, 'keep.txt'), 'keep')

    const result = runCleanScript()

    expect(result.status).toBe(0)
    expect(existsSync(releaseDir)).toBe(false)
    expect(existsSync(join(testRoot, 'keep.txt'))).toBe(true)
  })

  it('succeeds when the release directory does not exist', () => {
    const result = runCleanScript()

    expect(result.status).toBe(0)
    expect(existsSync(join(testRoot, 'release'))).toBe(false)
  })
})
