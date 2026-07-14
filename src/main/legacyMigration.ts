/**
 * Legacy userData migration from site-wallboard → sidecar-monitor.
 *
 * Rules:
 * - Must run before configStore.load() and session.fromPartition().
 * - If newUserData already has a migration marker, skip.
 * - Copy config.json only when the new directory lacks one.
 * - Recursively copy Partitions/site-* entries that are absent in newUserData.
 * - Never overwrite existing new-directory data.
 * - Never delete old data.
 * - Skips lock files and Chromium cache directories.
 * - Fully parameterized — no direct app.getPath() calls — for easy unit testing.
 *
 * ⚠️  Cookie encryption note (macOS/Windows):
 * Chromium may protect Cookies with the OS keychain using the *app name / appId*.
 * If the appId changed, encrypted cookies may not be readable in the new partition
 * even after a successful file copy. Site configs and localStorage are unaffected.
 * In that case the user must log in again; the migration still reports success for
 * the Partitions copy so configs are preserved.
 */

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  lstatSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export interface MigrationResult {
  /** Migration was skipped because a marker already exists or no candidate found. */
  skipped: boolean
  /** Migration marker was written to newUserData. */
  markerWritten: boolean
  /** config.json was copied from legacy. */
  configCopied: boolean
  /** Partition directory names that were copied. */
  partitionsCopied: string[]
  /** Non-fatal errors encountered during the migration. */
  errors: string[]
}

const MIGRATION_MARKER = '.sidecar-monitor-migration-done'
/** Files and directories never copied during migration. */
const SKIP_NAMES = new Set([
  'Lock',
  '.lock',
  'SingletonCookie',
  'SingletonLock',
  'SingletonSocket',
  'cache',
  'Cache',
  'Code Cache',
  'GPUCache',
  'ShaderCache',
  'DawnCache',
])

export interface MigrationParams {
  /** Resolved path to the new app userData directory. */
  newUserData: string
  /** Candidate legacy userData directories, tried in order. */
  candidates: string[]
}

/**
 * Run the one-time legacy migration.
 * Pure function — all I/O paths come from params.
 */
export async function migrateFromLegacy(
  params: MigrationParams,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    skipped: false,
    markerWritten: false,
    configCopied: false,
    partitionsCopied: [],
    errors: [],
  }

  // Idempotency: if marker already present, skip everything.
  const markerPath = join(params.newUserData, MIGRATION_MARKER)
  if (existsSync(markerPath)) {
    result.skipped = true
    return result
  }

  const sources = params.candidates.filter(c =>
    existsSync(join(c, 'config.json')) || existsSync(join(c, 'Partitions'))
  )
  if (sources.length === 0) {
    result.skipped = true
    return result
  }

  // Ensure new userData directory exists.
  try {
    mkdirSync(params.newUserData, { recursive: true })
  } catch (err) {
    result.errors.push(`Failed to create newUserData dir: ${String(err)}`)
    return result
  }

  // 1. Copy config.json if absent in new directory.
  const dstConfig = join(params.newUserData, 'config.json')
  if (!existsSync(dstConfig)) {
    for (const source of sources) {
      const srcConfig = join(source, 'config.json')
      if (!existsSync(srcConfig)) continue
      try {
        copyFileAtomic(srcConfig, dstConfig)
        result.configCopied = true
        break
      } catch (err) {
        result.errors.push(`Failed to copy config.json from ${source}: ${String(err)}`)
      }
    }
  }

  // 2. Merge Partitions/site-* from every legacy candidate (missing only).
  const dstPartitions = join(params.newUserData, 'Partitions')

  for (const source of sources) {
    const srcPartitions = join(source, 'Partitions')
    if (!existsSync(srcPartitions)) continue
    let entries: string[] = []
    try {
      entries = readdirSync(srcPartitions)
    } catch (err) {
      result.errors.push(`Cannot read src Partitions: ${String(err)}`)
    }

    for (const entry of entries) {
      if (!entry.startsWith('site-')) continue
      const srcPart = join(srcPartitions, entry)
      const dstPart = join(dstPartitions, entry)
      if (existsSync(dstPart)) continue // never overwrite existing
      const tmpPart = join(dstPartitions, `.${entry}.migration-tmp`)
      try {
        const errorCount = result.errors.length
        rmSync(tmpPart, { recursive: true, force: true })
        mkdirSync(tmpPart, { recursive: true })
        copyDirRecursive(srcPart, tmpPart, result.errors)
        if (result.errors.length === errorCount) {
          renameSync(tmpPart, dstPart)
          result.partitionsCopied.push(entry)
        } else {
          rmSync(tmpPart, { recursive: true, force: true })
        }
      } catch (err) {
        rmSync(tmpPart, { recursive: true, force: true })
        result.errors.push(`Failed to copy partition ${entry}: ${String(err)}`)
      }
    }
  }

  // 3. Only mark a complete migration. Partial failures are retried next launch.
  if (result.errors.length > 0) return result
  try {
    writeFileSync(
      markerPath,
      JSON.stringify({
        migratedAt: new Date().toISOString(),
        sources,
        configCopied: result.configCopied,
        partitionsCopied: result.partitionsCopied,
        errors: result.errors,
      }),
      'utf-8',
    )
    result.markerWritten = true
  } catch (err) {
    result.errors.push(`Failed to write migration marker: ${String(err)}`)
  }

  return result
}

function copyDirRecursive(src: string, dst: string, errors: string[]): void {
  let entries: string[] = []
  try {
    entries = readdirSync(src)
  } catch (err) {
    errors.push(`Cannot read dir ${src}: ${String(err)}`)
    return
  }

  for (const name of entries) {
    if (SKIP_NAMES.has(name)) continue
    const srcPath = join(src, name)
    const dstPath = join(dst, name)
    if (existsSync(dstPath)) continue // never overwrite
    try {
      const st = lstatSync(srcPath)
      if (st.isDirectory()) {
        mkdirSync(dstPath, { recursive: true })
        copyDirRecursive(srcPath, dstPath, errors)
      } else if (st.isFile()) {
        copyFileSync(srcPath, dstPath)
      }
    } catch (err) {
      errors.push(`Failed to copy ${srcPath}: ${String(err)}`)
    }
  }

}

function copyFileAtomic(src: string, dst: string): void {
  const tmp = `${dst}.migration-tmp`
  rmSync(tmp, { force: true })
  try {
    copyFileSync(src, tmp)
    renameSync(tmp, dst)
  } finally {
    rmSync(tmp, { force: true })
  }
}
