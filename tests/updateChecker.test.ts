import { describe, expect, it, vi } from 'vitest'
import { checkForUpdates, compareVersions, RELEASES_URL } from '../src/main/updateChecker'

describe('compareVersions', () => {
  it.each([
    ['0.1.8', '0.1.7'],
    ['0.2.0', '0.1.99'],
    ['1.0.0', '0.99.99'],
    ['1.0.0', '1.0.0-rc.1'],
    ['1.0.0-rc.2', '1.0.0-rc.1'],
    ['1.0.0-beta.11', '1.0.0-beta.2'],
    ['1.0.0-beta', '1.0.0-alpha'],
    ['999999999999999999999.0.0', '999999999999999999998.0.0'],
  ])('treats %s as newer than %s', (newer, older) => {
    expect(compareVersions(newer, older)).toBeGreaterThan(0)
    expect(compareVersions(older, newer)).toBeLessThan(0)
  })

  it.each([
    ['0.1.7', 'v0.1.7'],
    ['1.2.3+build.5', '1.2.3+build.9'],
  ])('treats %s and %s as equivalent', (a, b) => {
    expect(compareVersions(a, b)).toBe(0)
  })

  it.each(['1.2', '1.2.3.4', '01.2.3', '1.02.3', '1.2.3-rc.01', 'release-1.2.3'])(
    'rejects invalid version %s',
    version => expect(() => compareVersions(version, '1.0.0')).toThrow('Invalid version'),
  )
})

describe('checkForUpdates', () => {
  function redirectResponse(location: string, status = 302): Response {
    return new Response(null, {
      status,
      headers: { Location: location },
    })
  }

  it('reports a newer GitHub release from the latest redirect and uses the fixed URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      redirectResponse('https://github.com/huluohu/sidecar-monitor/releases/tag/v0.2.0'),
    )

    await expect(checkForUpdates('0.1.7', { fetchImpl })).resolves.toEqual({
      currentVersion: '0.1.7',
      latestVersion: '0.2.0',
      updateAvailable: true,
      releaseUrl: RELEASES_URL,
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://github.com/huluohu/sidecar-monitor/releases/latest',
    )
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
  })

  it('reports no update for the same or an older release', async () => {
    const same = vi.fn<typeof fetch>().mockResolvedValue(
      redirectResponse('/huluohu/sidecar-monitor/releases/tag/v0.1.7'),
    )
    const older = vi.fn<typeof fetch>().mockResolvedValue(
      redirectResponse('https://github.com/huluohu/sidecar-monitor/releases/tag/v0.1.6'),
    )

    await expect(checkForUpdates('0.1.7', { fetchImpl: same })).resolves.toMatchObject({
      updateAvailable: false,
    })
    await expect(checkForUpdates('0.1.7', { fetchImpl: older })).resolves.toMatchObject({
      updateAvailable: false,
    })
  })

  it('rejects HTTP failures and malformed release tags', async () => {
    const failed = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }))
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(
      redirectResponse('https://github.com/huluohu/sidecar-monitor/releases/tag/latest'),
    )

    await expect(checkForUpdates('0.1.7', { fetchImpl: failed })).rejects.toThrow('HTTP 503')
    await expect(checkForUpdates('0.1.7', { fetchImpl: malformed })).rejects.toThrow(
      'invalid version tag',
    )
  })

  it('rejects redirects outside the fixed GitHub repository', async () => {
    const external = vi.fn<typeof fetch>().mockResolvedValue(
      redirectResponse('https://example.com/huluohu/sidecar-monitor/releases/tag/v9.9.9'),
    )
    const otherRepo = vi.fn<typeof fetch>().mockResolvedValue(
      redirectResponse('https://github.com/other/repository/releases/tag/v9.9.9'),
    )

    await expect(checkForUpdates('0.1.7', { fetchImpl: external })).rejects.toThrow(
      'unexpected redirect',
    )
    await expect(checkForUpdates('0.1.7', { fetchImpl: otherRepo })).rejects.toThrow(
      'unexpected redirect',
    )
  })

  it('aborts a request that exceeds the timeout', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))

    try {
      const assertion = expect(
        checkForUpdates('0.1.7', { fetchImpl, timeoutMs: 100 }),
      ).rejects.toThrow('Update check timed out')
      await vi.advanceTimersByTimeAsync(100)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not request the network when the installed version is invalid', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    await expect(checkForUpdates('development', { fetchImpl })).rejects.toThrow('Invalid version')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

