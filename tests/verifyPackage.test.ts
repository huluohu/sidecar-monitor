/**
 * Unit tests for the pure parsing helpers in scripts/verify-package.mjs.
 *
 * Pure helpers live in a side-effect-free ESM module so Windows does not need
 * to import the executable CLI validator. Integration checks against locally
 * present artifacts run only when the relevant files exist.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDesktopEntry, parsePlistKey } from '../scripts/package-parsers.mjs'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..')
const RELEASE = resolve(ROOT, 'release')

// ── parsePlistKey ────────────────────────────────────────────────────────────

describe('parsePlistKey', () => {
  const SAMPLE_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleDisplayName</key>
    <string>Sidecar Monitor</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.opentcs.sidecar-monitor</string>
    <key>CFBundleVersion</key>
    <string>0.1.3</string>
  </dict>
</plist>`

  it('extracts a top-level string value', () => {
    expect(parsePlistKey(SAMPLE_PLIST, 'CFBundleIconFile')).toBe('icon.icns')
  })

  it('extracts other string keys from the same document', () => {
    expect(parsePlistKey(SAMPLE_PLIST, 'CFBundleDisplayName')).toBe('Sidecar Monitor')
    expect(parsePlistKey(SAMPLE_PLIST, 'CFBundleIdentifier')).toBe('com.opentcs.sidecar-monitor')
    expect(parsePlistKey(SAMPLE_PLIST, 'CFBundleVersion')).toBe('0.1.3')
  })

  it('returns null for a key that does not exist', () => {
    expect(parsePlistKey(SAMPLE_PLIST, 'NSHumanReadableCopyright')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parsePlistKey('', 'CFBundleIconFile')).toBeNull()
  })

  it('handles whitespace between <key> and <string> (tabs, multiple newlines)', () => {
    const loose = '<key>MyKey</key>\n\n\t<string>  hello  </string>'
    expect(parsePlistKey(loose, 'MyKey')).toBe('hello')
  })

  it('handles keys with regex-special characters', () => {
    const xml = '<key>App.Name+Version</key>\n<string>v2</string>'
    expect(parsePlistKey(xml, 'App.Name+Version')).toBe('v2')
  })

  it('does not cross-match a key that is a prefix of another key', () => {
    const xml =
      '<key>CFBundleIcon</key>\n<string>bad</string>\n' +
      '<key>CFBundleIconFile</key>\n<string>good</string>'
    expect(parsePlistKey(xml, 'CFBundleIconFile')).toBe('good')
  })
})

// ── parseDesktopEntry ────────────────────────────────────────────────────────

describe('parseDesktopEntry', () => {
  const SAMPLE_DESKTOP = `[Desktop Entry]
Type=Application
Name=Sidecar Monitor
Comment=Multi-site Sidecar monitor desktop tool
Exec=sidecar-monitor %U
Icon=sidecar-monitor
Terminal=false
Categories=Utility;
`

  it('parses Name and Icon from a well-formed desktop entry', () => {
    const fields = parseDesktopEntry(SAMPLE_DESKTOP)
    expect(fields['Name']).toBe('Sidecar Monitor')
    expect(fields['Icon']).toBe('sidecar-monitor')
  })

  it('parses all key=value pairs', () => {
    const fields = parseDesktopEntry(SAMPLE_DESKTOP)
    expect(fields['Type']).toBe('Application')
    expect(fields['Terminal']).toBe('false')
    expect(fields['Exec']).toBe('sidecar-monitor %U')
  })

  it('ignores comment lines', () => {
    const text = '# This is a comment\nKey=Value\n'
    expect(parseDesktopEntry(text)).toEqual({ Key: 'Value' })
  })

  it('ignores section headers', () => {
    const text = '[Desktop Entry]\nKey=Value\n[OtherSection]\nKey2=Value2\n'
    const fields = parseDesktopEntry(text)
    expect(fields['Key']).toBe('Value')
    expect(fields['Key2']).toBe('Value2')
    expect(Object.keys(fields)).not.toContain('[Desktop Entry]')
  })

  it('first occurrence wins for duplicate keys', () => {
    const text = 'Key=first\nKey=second\n'
    expect(parseDesktopEntry(text)['Key']).toBe('first')
  })

  it('handles CRLF line endings', () => {
    const text = 'Name=Sidecar Monitor\r\nIcon=sidecar-monitor\r\n'
    const fields = parseDesktopEntry(text)
    expect(fields['Name']).toBe('Sidecar Monitor')
    expect(fields['Icon']).toBe('sidecar-monitor')
  })

  it('returns empty object for blank input', () => {
    expect(parseDesktopEntry('')).toEqual({})
    expect(parseDesktopEntry('   \n   \n')).toEqual({})
  })

  it('handles values that contain = characters', () => {
    const text = 'MimeType=x-scheme-handler/http;x-scheme-handler/https;\n'
    expect(parseDesktopEntry(text)['MimeType']).toBe(
      'x-scheme-handler/http;x-scheme-handler/https;',
    )
  })
})

// ── Integration: locally present macOS artifacts ─────────────────────────────

describe('macOS artifacts (local)', () => {
  const macDirs = existsSync(RELEASE)
    ? readdirSync(RELEASE).filter((d) => {
        if (!d.startsWith('mac')) return false
        try {
          return statSync(join(RELEASE, d)).isDirectory()
        } catch {
          return false
        }
      })
    : []

  if (macDirs.length === 0) {
    it.todo('no release/mac* dirs present — skipping macOS artifact integration checks')
  }

  for (const macDir of macDirs) {
    const bundles = existsSync(join(RELEASE, macDir))
      ? readdirSync(join(RELEASE, macDir)).filter((f) => f.endsWith('.app'))
      : []

    for (const bundle of bundles) {
      const plistPath = join(RELEASE, macDir, bundle, 'Contents', 'Info.plist')

      it(`${macDir}/${bundle}: Info.plist exists and is non-empty`, () => {
        expect(existsSync(plistPath), `missing: ${plistPath}`).toBe(true)
        expect(statSync(plistPath).size).toBeGreaterThan(0)
      })

      it(`${macDir}/${bundle}: CFBundleIconFile references a non-empty .icns`, () => {
        const xml = readFileSync(plistPath, 'utf8')
        let iconFile = parsePlistKey(xml, 'CFBundleIconFile')
        expect(iconFile, 'CFBundleIconFile key missing in Info.plist').not.toBeNull()
        if (!iconFile!.endsWith('.icns')) iconFile += '.icns'
        const icnsPath = join(RELEASE, macDir, bundle, 'Contents', 'Resources', iconFile!)
        expect(existsSync(icnsPath), `icon not found: ${icnsPath}`).toBe(true)
        expect(statSync(icnsPath).size, `icon is empty: ${icnsPath}`).toBeGreaterThan(0)
      })
    }
  }

  it('DMG artifact(s) are present and non-empty', () => {
    if (macDirs.length === 0) return
    const dmgs = readdirSync(RELEASE).filter((f) => f.endsWith('.dmg'))
    expect(dmgs.length, 'no .dmg artifacts found in release/').toBeGreaterThan(0)
    for (const dmg of dmgs) {
      expect(statSync(join(RELEASE, dmg)).size, `${dmg} is empty`).toBeGreaterThan(0)
    }
  })

  it('ZIP artifact(s) are present and non-empty', () => {
    if (macDirs.length === 0) return
    const zips = readdirSync(RELEASE).filter(
      (f) => f.endsWith('.zip') && !f.endsWith('.blockmap'),
    )
    expect(zips.length, 'no .zip artifacts found in release/').toBeGreaterThan(0)
    for (const z of zips) {
      expect(statSync(join(RELEASE, z)).size, `${z} is empty`).toBeGreaterThan(0)
    }
  })
})

// ── Integration: locally present Linux .deb ──────────────────────────────────

describe('Linux deb artifacts (local, dpkg-deb required)', () => {
  const debs = existsSync(RELEASE)
    ? readdirSync(RELEASE).filter((f) => f.endsWith('.deb'))
    : []

  if (debs.length === 0) {
    it.todo('no .deb artifacts present — skipping deb integration checks')
  }

  for (const deb of debs) {
    it(`${deb}: exists and is non-empty`, () => {
      expect(statSync(join(RELEASE, deb)).size).toBeGreaterThan(0)
    })
  }
})
