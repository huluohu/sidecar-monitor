import { describe, expect, it } from 'vitest'
import { toSiteUserAgent } from '../src/shared/userAgent'

describe('toSiteUserAgent', () => {
  const chromium =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

  it('removes Electron while preserving Chromium and platform information', () => {
    expect(toSiteUserAgent(`${chromium} Electron/43.1.0`)).toBe(chromium)
  })

  it('removes Sidecar Monitor product tokens regardless of casing', () => {
    expect(toSiteUserAgent(`${chromium} sidecar-monitor/0.1.3`)).toBe(chromium)
    expect(toSiteUserAgent(`${chromium} SIDECARMONITOR/0.1.3`)).toBe(chromium)
  })

  it('removes multiple app tokens and normalizes whitespace left behind', () => {
    expect(
      toSiteUserAgent(`Electron/43.1.0   ${chromium}  Sidecar-Monitor/0.1.3`),
    ).toBe(chromium)
  })

  it('does not change an existing browser user agent', () => {
    expect(toSiteUserAgent(chromium)).toBe(chromium)
  })

  it('does not remove unrelated product tokens', () => {
    const userAgent = `${chromium} SomeElectronHelper/1.0 Monitor/2.0`
    expect(toSiteUserAgent(userAgent)).toBe(userAgent)
  })
})
