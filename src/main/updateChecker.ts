export const RELEASES_URL = 'https://github.com/huluohu/sidecar-monitor/releases/latest'
const DEFAULT_TIMEOUT_MS = 10_000
const RELEASE_TAG_PATH = '/huluohu/sidecar-monitor/releases/tag/'

interface ParsedVersion {
  core: [string, string, string]
  prerelease: string[]
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  releaseUrl: string
}

export interface UpdateCheckOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value.trim())
  if (!match) return null

  const coreParts = match.slice(1, 4)
  if (coreParts.some(part => part.length > 1 && part.startsWith('0'))) return null

  const core = coreParts as [string, string, string]

  const prerelease = match[4]?.split('.') ?? []
  if (prerelease.some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0'))) {
    return null
  }

  return { core, prerelease }
}

function compareNumericIdentifiers(a: string, b: string): number {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** Compare two SemVer strings. Returns a positive number when a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a)
  const parsedB = parseVersion(b)
  if (!parsedA || !parsedB) throw new Error(`Invalid version: ${!parsedA ? a : b}`)

  for (let i = 0; i < parsedA.core.length; i += 1) {
    const comparison = compareNumericIdentifiers(parsedA.core[i], parsedB.core[i])
    if (comparison !== 0) return comparison
  }

  const preA = parsedA.prerelease
  const preB = parsedB.prerelease
  if (preA.length === 0 || preB.length === 0) {
    if (preA.length === preB.length) return 0
    return preA.length === 0 ? 1 : -1
  }

  const maxLength = Math.max(preA.length, preB.length)
  for (let i = 0; i < maxLength; i += 1) {
    if (preA[i] === undefined) return -1
    if (preB[i] === undefined) return 1
    if (preA[i] === preB[i]) continue

    const aIsNumber = /^\d+$/.test(preA[i])
    const bIsNumber = /^\d+$/.test(preB[i])
    if (aIsNumber && bIsNumber) return compareNumericIdentifiers(preA[i], preB[i])
    if (aIsNumber !== bIsNumber) return aIsNumber ? -1 : 1
    return preA[i] < preB[i] ? -1 : 1
  }

  return 0
}

export async function checkForUpdates(
  currentVersion: string,
  options: UpdateCheckOptions = {},
): Promise<UpdateCheckResult> {
  // Validate the installed version before making a network request.
  compareVersions(currentVersion, currentVersion)

  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(RELEASES_URL, {
      headers: {
        'User-Agent': `Sidecar-Monitor/${currentVersion}`,
      },
      redirect: 'manual',
      signal: controller.signal,
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error(`GitHub Releases returned HTTP ${response.status}`)
    }

    const location = response.headers.get('location')
    if (!location) throw new Error('GitHub Releases did not return a version tag')

    let releaseLocation: URL
    try {
      releaseLocation = new URL(location, RELEASES_URL)
    } catch {
      throw new Error('GitHub Releases returned an invalid redirect')
    }
    if (releaseLocation.origin !== 'https://github.com' ||
        !releaseLocation.pathname.startsWith(RELEASE_TAG_PATH)) {
      throw new Error('GitHub Releases returned an unexpected redirect')
    }

    const encodedTagName = releaseLocation.pathname.slice(RELEASE_TAG_PATH.length)
    let tagName: string
    try {
      tagName = decodeURIComponent(encodedTagName)
    } catch {
      throw new Error('GitHub release has an invalid version tag')
    }
    if (tagName.includes('/') || !parseVersion(tagName)) {
      throw new Error('GitHub release has an invalid version tag')
    }

    const latestVersion = tagName.trim().replace(/^v/, '')
    return {
      currentVersion,
      latestVersion,
      updateAvailable: compareVersions(tagName, currentVersion) > 0,
      releaseUrl: RELEASES_URL,
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Update check timed out')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

