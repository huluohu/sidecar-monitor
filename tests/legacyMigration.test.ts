import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrateFromLegacy } from '../src/main/legacyMigration'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sm-migration-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeDir(base: string, ...parts: string[]): string {
  const p = join(base, ...parts)
  mkdirSync(p, { recursive: true })
  return p
}

function makeFile(path: string, content = 'data'): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content, 'utf-8')
}

describe('migrateFromLegacy', () => {
  it('skips when no candidate exists', async () => {
    const newDir = makeDir(root, 'new')
    const result = await migrateFromLegacy({
      newUserData: newDir,
      candidates: [join(root, 'nonexistent')],
    })
    expect(result.skipped).toBe(true)
    expect(result.markerWritten).toBe(false)
  })

  it('skips when migration marker already exists', async () => {
    const newDir = makeDir(root, 'new')
    const srcDir = makeDir(root, 'src')
    // Write config in src
    makeFile(join(srcDir, 'config.json'), '{"test":true}')
    // Write marker in new
    writeFileSync(join(newDir, '.sidecar-monitor-migration-done'), 'done', 'utf-8')

    const result = await migrateFromLegacy({
      newUserData: newDir,
      candidates: [srcDir],
    })
    expect(result.skipped).toBe(true)
    // config.json should NOT have been copied again
    expect(existsSync(join(newDir, 'config.json'))).toBe(false)
  })

  it('copies config.json when new dir lacks it', async () => {
    const srcDir = makeDir(root, 'src')
    const newDir = makeDir(root, 'new')
    makeFile(join(srcDir, 'config.json'), '{"migrated":true}')

    const result = await migrateFromLegacy({
      newUserData: newDir,
      candidates: [srcDir],
    })
    expect(result.configCopied).toBe(true)
    expect(existsSync(join(newDir, 'config.json'))).toBe(true)
    expect(readFileSync(join(newDir, 'config.json'), 'utf-8')).toBe('{"migrated":true}')
    expect(result.markerWritten).toBe(true)
  })

  it('does NOT overwrite existing config.json', async () => {
    const srcDir = makeDir(root, 'src')
    const newDir = makeDir(root, 'new')
    makeFile(join(srcDir, 'config.json'), 'old-config')
    makeFile(join(newDir, 'config.json'), 'existing-config')

    const result = await migrateFromLegacy({
      newUserData: newDir,
      candidates: [srcDir],
    })
    expect(result.configCopied).toBe(false)
    expect(readFileSync(join(newDir, 'config.json'), 'utf-8')).toBe('existing-config')
  })

  it('copies site-* partitions from src', async () => {
    const srcDir = makeDir(root, 'src')
    const newDir = makeDir(root, 'new')
    const part = makeDir(srcDir, 'Partitions', 'site-abc')
    makeFile(join(part, 'Cookies'), 'cookie-data')
    makeFile(join(part, 'localStorage', 'data.ldb'), 'ls-data')

    const result = await migrateFromLegacy({
      newUserData: newDir,
      candidates: [srcDir],
    })
    expect(result.partitionsCopied).toContain('site-abc')
    expect(existsSync(join(newDir, 'Partitions', 'site-abc', 'Cookies'))).toBe(true)
    expect(existsSync(join(newDir, 'Partitions', 'site-abc', 'localStorage', 'data.ldb'))).toBe(true)
  })

  it('does NOT overwrite existing partition content', async () => {
    const srcDir = makeDir(root, 'src')
    const newDir = makeDir(root, 'new')
    const srcPart = makeDir(srcDir, 'Partitions', 'site-xyz')
    makeFile(join(srcPart, 'Cookies'), 'old-cookies')
    // Existing partition in new dir
    const dstPart = makeDir(newDir, 'Partitions', 'site-xyz')
    makeFile(join(dstPart, 'Cookies'), 'new-cookies')

    const result = await migrateFromLegacy({
      newUserData: newDir,
      candidates: [srcDir],
    })
    // Partition dir exists in dst → skipped
    expect(result.partitionsCopied).not.toContain('site-xyz')
    expect(readFileSync(join(newDir, 'Partitions', 'site-xyz', 'Cookies'), 'utf-8')).toBe('new-cookies')
  })

  it('skips non-site-* partition directories', async () => {
    const srcDir = makeDir(root, 'src')
    const newDir = makeDir(root, 'new')
    makeDir(srcDir, 'Partitions', 'extensions')
    makeDir(srcDir, 'Partitions', 'site-ok')

    const result = await migrateFromLegacy({
      newUserData: newDir,
      candidates: [srcDir],
    })
    expect(result.partitionsCopied).toContain('site-ok')
    expect(existsSync(join(newDir, 'Partitions', 'extensions'))).toBe(false)
  })

  it('tries candidates in order and uses first candidate with migratable data', async () => {
    const firstDir = makeDir(root, 'first')
    const secondDir = makeDir(root, 'second')
    const newDir = makeDir(root, 'new')
    makeFile(join(firstDir, 'config.json'), 'from-first')
    makeFile(join(secondDir, 'config.json'), 'from-second')

    const result = await migrateFromLegacy({
      newUserData: newDir,
      candidates: [firstDir, secondDir],
    })

    expect(result.configCopied).toBe(true)
    expect(readFileSync(join(newDir, 'config.json'), 'utf-8')).toBe('from-first')
  })

  it('ignores an empty earlier candidate', async () => {
    const emptyDir = makeDir(root, 'empty')
    const dataDir = makeDir(root, 'with-data')
    const newDir = makeDir(root, 'new')
    makeFile(join(dataDir, 'config.json'), 'from-data-dir')

    await migrateFromLegacy({
      newUserData: newDir,
      candidates: [emptyDir, dataDir],
    })
    expect(readFileSync(join(newDir, 'config.json'), 'utf-8')).toBe('from-data-dir')
  })

  it('writes a migration marker file', async () => {
    const srcDir = makeDir(root, 'src')
    const newDir = makeDir(root, 'new')
    makeFile(join(srcDir, 'config.json'), '{}')

    await migrateFromLegacy({ newUserData: newDir, candidates: [srcDir] })
    const markerPath = join(newDir, '.sidecar-monitor-migration-done')
    expect(existsSync(markerPath)).toBe(true)
    const marker = JSON.parse(readFileSync(markerPath, 'utf-8')) as Record<string, unknown>
    expect(typeof marker.migratedAt).toBe('string')
    expect(marker.sources).toEqual([srcDir])
  })

  it('merges config and partitions from different legacy candidates', async () => {
    const configDir = makeDir(root, 'config-source')
    const sessionDir = makeDir(root, 'session-source')
    const newDir = makeDir(root, 'new')
    makeFile(join(configDir, 'config.json'), '{"from":"config-source"}')
    makeFile(join(sessionDir, 'Partitions', 'site-session', 'Cookies'), 'cookies')

    const result = await migrateFromLegacy({
      newUserData: newDir,
      candidates: [configDir, sessionDir],
    })

    expect(result.configCopied).toBe(true)
    expect(result.partitionsCopied).toContain('site-session')
    expect(readFileSync(join(newDir, 'config.json'), 'utf-8')).toBe('{"from":"config-source"}')
    expect(readFileSync(join(newDir, 'Partitions', 'site-session', 'Cookies'), 'utf-8')).toBe('cookies')
  })

  it('does not mark a partial migration as complete', async () => {
    const srcDir = makeDir(root, 'src')
    const newDir = makeDir(root, 'new')
    // Create a partition dir as a FILE (not a dir) in src to trigger a copy error
    makeFile(join(srcDir, 'Partitions', 'site-bad'), '')

    const result = await migrateFromLegacy({ newUserData: newDir, candidates: [srcDir] })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.markerWritten).toBe(false)
    expect(existsSync(join(newDir, '.sidecar-monitor-migration-done'))).toBe(false)
    expect(existsSync(join(newDir, 'Partitions', 'site-bad'))).toBe(false)
  })
})
