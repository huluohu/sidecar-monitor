#!/usr/bin/env node
/**
 * Post-package asset validator for CI.
 * Usage: node scripts/verify-package.mjs <mac|win|linux>
 *
 * Exits 0 on success, 1 on the first validation failure.
 * Pure parsing helpers are named exports so unit tests can import them.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseDesktopEntry, parsePlistKey } from './package-parsers.mjs'
import { extractRpmArchive } from './process-pipeline.mjs'

export { parseDesktopEntry, parsePlistKey } from './package-parsers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const RELEASE = resolve(ROOT, 'release')
// Extraction work area lives inside the project root; cleaned on exit.
const WORK_DIR = resolve(ROOT, '.verify-work')

process.on('exit', () => {
  if (existsSync(WORK_DIR)) rmSync(WORK_DIR, { recursive: true, force: true })
})

// ── Internal utilities ───────────────────────────────────────────────────────

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function fail(msg) {
  console.error(`\n❌  ASSET VALIDATION FAILED\n    ${msg}\n`)
  process.exit(1)
}

function assertFile(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} not found: ${filePath}`)
  const { size } = statSync(filePath)
  if (size === 0) fail(`${label} is empty (0 bytes): ${filePath}`)
  console.log(`  ✅  ${label} (${size} bytes)`)
  return size
}

/** Return absolute paths of direct children of dir matching predicate. */
function listDir(dir, predicate) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(predicate)
    .map((f) => resolve(dir, f))
}

/** Require ≥1 matching artifact in dir; fails with a clear message if none. */
function requireArtifact(dir, predicate, label) {
  const found = listDir(dir, predicate)
  if (found.length === 0) fail(`No ${label} artifact found in ${dir}`)
  for (const f of found) assertFile(f, label)
  return found
}

/** Recursively collect files ending with suffix under root. */
function collectFiles(root, suffix) {
  const results = []
  function walk(dir) {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(suffix)) results.push(full)
    }
  }
  walk(root)
  return results
}

function makeTempDir(tag) {
  const d = join(WORK_DIR, tag)
  mkdirSync(d, { recursive: true })
  return d
}

// ── macOS validation ─────────────────────────────────────────────────────────

function validateMac() {
  console.log('\n── macOS package validation ──')

  // Find all release/mac*/ directories (mac, mac-arm64, …)
  const macDirs = listDir(RELEASE, (d) => {
    if (!d.startsWith('mac')) return false
    try {
      return statSync(resolve(RELEASE, d)).isDirectory()
    } catch {
      return false
    }
  })
  if (macDirs.length === 0) fail('No release/mac* directories found')

  for (const macDir of macDirs) {
    const bundles = listDir(macDir, (f) => f.endsWith('.app'))
    if (bundles.length === 0) fail(`No .app bundle found in ${macDir}`)

    for (const bundle of bundles) {
      console.log(`\n  Checking bundle: ${bundle}`)

      const plistPath = join(bundle, 'Contents', 'Info.plist')
      assertFile(plistPath, 'Info.plist')

      const plistXml = readFileSync(plistPath, 'utf8')
      let iconFile = parsePlistKey(plistXml, 'CFBundleIconFile')
      if (!iconFile) fail(`CFBundleIconFile key missing in ${plistPath}`)

      // electron-builder may omit the .icns extension in the plist value
      if (!iconFile.endsWith('.icns')) iconFile += '.icns'

      const icnsPath = join(bundle, 'Contents', 'Resources', iconFile)
      assertFile(icnsPath, `icon (${iconFile})`)
    }
  }

  // Verify top-level release artifacts
  requireArtifact(RELEASE, (f) => f.endsWith('.dmg'), 'DMG')
  requireArtifact(
    RELEASE,
    (f) => f.endsWith('.zip') && !f.endsWith('.blockmap'),
    'ZIP',
  )

  console.log('\n✅  macOS validation passed\n')
}

// ── Windows validation ───────────────────────────────────────────────────────

function validateWin() {
  console.log('\n── Windows package validation ──')

  // Unpacked application executable
  const unpackedExe = resolve(RELEASE, 'win-unpacked', 'sidecar-monitor.exe')
  assertFile(unpackedExe, 'win-unpacked/sidecar-monitor.exe')

  // NSIS installer lives in release root (not inside win-unpacked/)
  const installers = requireArtifact(RELEASE, (f) => f.endsWith('.exe'), 'NSIS installer')

  // On Windows: use PowerShell / System.Drawing to verify icons are non-null
  if (process.platform === 'win32') {
    const targets = [unpackedExe, ...installers]
    for (const exePath of targets) {
      console.log(`\n  Checking icon for ${exePath}…`)
      // Build each line separately to avoid template-literal conflicts with PS $ vars
      const psLines = [
        'Add-Type -AssemblyName System.Drawing',
        `$path = '${exePath.replace(/'/g, "''")}'`,
        '$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)',
        'if ($null -eq $icon) { Write-Error "Icon is null for $path"; exit 1 }',
        'if ($icon.Width -eq 0 -or $icon.Height -eq 0) { Write-Error "Icon has zero dimensions for $path"; exit 1 }',
        'Write-Output ("icon " + $icon.Width + "x" + $icon.Height)',
      ]
      const result = spawnSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', psLines.join('; ')],
        { encoding: 'utf8', timeout: 30_000 },
      )
      if (result.status !== 0) {
        fail(`Icon check failed for ${exePath}:\n${result.stderr || result.stdout}`)
      }
      console.log(`  ✅  icon ok: ${result.stdout.trim()}`)
    }
  }

  console.log('\n✅  Windows validation passed\n')
}

// ── Linux helpers ─────────────────────────────────────────────────────────────

const HICOLOR_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]

function assertPng(filePath, label) {
  if (!existsSync(filePath)) fail(`${label}: PNG not found: ${filePath}`)
  const { size } = statSync(filePath)
  if (size === 0) fail(`${label}: PNG is empty: ${filePath}`)
  const header = readFileSync(filePath).subarray(0, 8)
  if (!header.equals(PNG_SIG)) fail(`${label}: not a valid PNG: ${filePath}`)
  console.log(`    ✅  ${label} (${size} bytes)`)
}

function assertDesktopFields(text, source) {
  const fields = parseDesktopEntry(text)
  if (fields['Name'] !== 'Sidecar Monitor') {
    fail(`Desktop entry Name="${fields['Name']}" (expected "Sidecar Monitor") in ${source}`)
  }
  if (fields['Icon'] !== 'sidecar-monitor') {
    fail(`Desktop entry Icon="${fields['Icon']}" (expected "sidecar-monitor") in ${source}`)
  }
  console.log(`    ✅  .desktop Name=Sidecar Monitor, Icon=sidecar-monitor`)
}

function checkHicolorIcons(root, label) {
  for (const size of HICOLOR_SIZES) {
    const p = join(
      root,
      'usr',
      'share',
      'icons',
      'hicolor',
      `${size}x${size}`,
      'apps',
      'sidecar-monitor.png',
    )
    assertPng(p, `${label} hicolor/${size}x${size}`)
  }
}

function checkDebPackage(debPath) {
  console.log(`\n  Checking .deb: ${debPath}`)
  const workDir = makeTempDir('deb')

  const res = spawnSync('dpkg-deb', ['-x', debPath, workDir], { encoding: 'utf8' })
  if (res.status !== 0) fail(`dpkg-deb -x failed: ${res.stderr || res.stdout}`)

  const desktopFiles = collectFiles(workDir, '.desktop')
  if (desktopFiles.length === 0) fail(`No .desktop file in deb package: ${debPath}`)
  assertDesktopFields(readFileSync(desktopFiles[0], 'utf8'), desktopFiles[0])

  checkHicolorIcons(workDir, 'deb')
}

async function checkRpmPackage(rpmPath) {
  console.log(`\n  Checking .rpm: ${rpmPath}`)

  // Validate content list first (fast, no extraction)
  const listRes = spawnSync('rpm', ['-qlp', rpmPath], { encoding: 'utf8' })
  if (listRes.status !== 0) fail(`rpm -qlp failed: ${listRes.stderr || listRes.stdout}`)

  const entries = new Set(listRes.stdout.split('\n').map((l) => l.trim()).filter(Boolean))
  if (!Array.from(entries).some((e) => e.endsWith('.desktop'))) {
    fail(`No .desktop entry found in RPM: ${rpmPath}`)
  }
  for (const size of HICOLOR_SIZES) {
    const expected = `/usr/share/icons/hicolor/${size}x${size}/apps/sidecar-monitor.png`
    if (!entries.has(expected)) fail(`RPM missing icon ${size}x${size}: ${rpmPath}`)
  }
  console.log(`    ✅  RPM file list contains .desktop and all hicolor sizes`)

  // Extract and verify actual desktop content + PNG byte signatures
  const workDir = makeTempDir('rpm')
  try {
    await extractRpmArchive(rpmPath, workDir)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }

  const desktopFiles = collectFiles(workDir, '.desktop')
  if (desktopFiles.length > 0) {
    assertDesktopFields(readFileSync(desktopFiles[0], 'utf8'), desktopFiles[0])
  }
  checkHicolorIcons(workDir, 'rpm')
}

function checkAppImage(appImagePath) {
  console.log(`\n  Checking AppImage: ${appImagePath}`)

  // Make executable (required to run --appimage-extract)
  spawnSync('chmod', ['+x', appImagePath])

  const workDir = makeTempDir('appimage')
  const extractDir = join(workDir, 'squashfs-root')

  // Primary: --appimage-extract (works without FUSE on GitHub runners)
  let extracted = false
  const exRes = spawnSync(appImagePath, ['--appimage-extract'], {
    cwd: workDir,
    encoding: 'utf8',
    timeout: 90_000,
  })
  if (exRes.status === 0 && existsSync(extractDir)) {
    extracted = true
    console.log('    extracted via --appimage-extract')
  }

  // Fallback: unsquashfs (squashfs-tools package)
  if (!extracted) {
    console.log('    --appimage-extract failed, trying unsquashfs…')
    const uRes = spawnSync('unsquashfs', ['-d', extractDir, appImagePath], {
      encoding: 'utf8',
      timeout: 90_000,
    })
    if (uRes.status !== 0) fail(`AppImage extraction failed:\n${uRes.stderr || uRes.stdout}`)
    extracted = true
    console.log('    extracted via unsquashfs')
  }

  // Verify .desktop entry
  const desktopFiles = collectFiles(extractDir, '.desktop')
  if (desktopFiles.length === 0) fail(`No .desktop file in AppImage: ${appImagePath}`)
  assertDesktopFields(readFileSync(desktopFiles[0], 'utf8'), desktopFiles[0])

  // Verify icon at AppImage root (electron-builder places .png/.svg there)
  const rootIcons = readdirSync(extractDir).filter(
    (f) => f.endsWith('.png') || f.endsWith('.svg') || f.endsWith('.icns'),
  )
  if (rootIcons.length === 0) fail(`No root icon file in AppImage: ${appImagePath}`)
  const iconPath = join(extractDir, rootIcons[0])
  if (rootIcons[0].endsWith('.png')) assertPng(iconPath, `AppImage root icon (${rootIcons[0]})`)
  else assertFile(iconPath, `AppImage root icon (${rootIcons[0]})`)
}

// ── Linux top-level validation ───────────────────────────────────────────────

async function validateLinux() {
  console.log('\n── Linux package validation ──')

  const debs = requireArtifact(RELEASE, (f) => f.endsWith('.deb'), 'DEB')
  const rpms = requireArtifact(RELEASE, (f) => f.endsWith('.rpm'), 'RPM')
  const appImages = requireArtifact(RELEASE, (f) => f.endsWith('.AppImage'), 'AppImage')

  for (const deb of debs) checkDebPackage(deb)
  for (const rpm of rpms) await checkRpmPackage(rpm)
  for (const ai of appImages) checkAppImage(ai)

  console.log('\n✅  Linux validation passed\n')
}

// ── Entry point ───────────────────────────────────────────────────────────────

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectExecution) {
  const platform = process.argv[2]
  if (!platform) {
    console.error('Usage: node scripts/verify-package.mjs <mac|win|linux>')
    process.exit(1)
  }

  switch (platform) {
    case 'mac':
      validateMac()
      break
    case 'win':
      validateWin()
      break
    case 'linux':
      await validateLinux()
      break
    default:
      console.error(`Unknown platform: "${platform}". Expected: mac, win, linux`)
      process.exit(1)
  }
}
