import { describe, it, expect } from 'vitest'
import { parseConfig, validateSite, isHttpUrl, DEFAULT_CONFIG } from '../src/shared/configSchema'
import type { AppConfig } from '../src/shared/types'

describe('isHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isHttpUrl('http://example.com')).toBe(true)
    expect(isHttpUrl('https://example.com/path?q=1')).toBe(true)
  })

  it('rejects non-http protocols', () => {
    expect(isHttpUrl('file:///etc/passwd')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('data:text/html,<h1>hi</h1>')).toBe(false)
    expect(isHttpUrl('ftp://example.com')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
    expect(isHttpUrl('not-a-url')).toBe(false)
    expect(isHttpUrl('https://user:password@example.com')).toBe(false)
  })
})

describe('validateSite', () => {
  const valid = {
    id: 'abc',
    name: 'Test',
    url: 'https://example.com',
    enabled: true,
    order: 0,
    zoomFactor: 1.0,
  }

  it('accepts valid site', () => {
    expect(validateSite(valid)).toBe(true)
  })

  it('rejects missing fields', () => {
    expect(validateSite({})).toBe(false)
    expect(validateSite({ ...valid, url: undefined })).toBe(false)
    expect(validateSite({ ...valid, enabled: 'yes' })).toBe(false)
  })

  it('rejects invalid URL', () => {
    expect(validateSite({ ...valid, url: 'file:///etc' })).toBe(false)
    expect(validateSite({ ...valid, url: '' })).toBe(false)
  })

  it('rejects out-of-range zoomFactor', () => {
    expect(validateSite({ ...valid, zoomFactor: 0 })).toBe(false)
    expect(validateSite({ ...valid, zoomFactor: 6 })).toBe(false)
    expect(validateSite({ ...valid, zoomFactor: 0.1 })).toBe(true)
    expect(validateSite({ ...valid, zoomFactor: 5.0 })).toBe(true)
  })

  it('rejects empty id', () => {
    expect(validateSite({ ...valid, id: '' })).toBe(false)
  })
})

describe('parseConfig', () => {
  const minimal: AppConfig = {
    schemaVersion: 1,
    sites: [],
    columns: 'auto',
    fullscreenOnLaunch: false,
  }

  it('parses a minimal valid config', () => {
    expect(parseConfig(minimal)).toMatchObject(minimal)
  })

  it('throws on non-object', () => {
    expect(() => parseConfig(null)).toThrow()
    expect(() => parseConfig('string')).toThrow()
  })

  it('throws on unknown schemaVersion', () => {
    expect(() => parseConfig({ ...minimal, schemaVersion: 2 })).toThrow('schemaVersion')
  })

  it('throws if sites is not an array', () => {
    expect(() => parseConfig({ ...minimal, sites: 'nope' })).toThrow('sites')
  })

  it('rejects the entire config when a site entry is invalid', () => {
    const raw = {
      ...minimal,
      sites: [
        { id: 'a', name: 'A', url: 'https://a.com', enabled: true, order: 0, zoomFactor: 1 },
        { id: '', name: 'Bad', url: 'file://bad', enabled: true, order: 1, zoomFactor: 1 },
      ],
    }
    expect(() => parseConfig(raw)).toThrow('index 1')
  })

  it('rejects invalid columns', () => {
    expect(() => parseConfig({ ...minimal, columns: -1 })).toThrow('columns')
    expect(() => parseConfig({ ...minimal, columns: 0 })).toThrow('columns')
    expect(() => parseConfig({ ...minimal, columns: 99 })).toThrow('columns')
    expect(parseConfig({ ...minimal, columns: 4 }).columns).toBe(4)
    expect(parseConfig({ ...minimal, columns: 'auto' }).columns).toBe('auto')
  })

  it('rejects invalid fullscreenOnLaunch', () => {
    expect(() => parseConfig({ ...minimal, fullscreenOnLaunch: 'yes' })).toThrow('fullscreenOnLaunch')
    expect(parseConfig({ ...minimal, fullscreenOnLaunch: true }).fullscreenOnLaunch).toBe(true)
  })

  it('rejects duplicate site IDs', () => {
    const site = {
      id: 'duplicate',
      name: 'Site',
      url: 'https://example.com',
      enabled: true,
      order: 0,
      zoomFactor: 1,
    }
    expect(() => parseConfig({ ...minimal, sites: [site, { ...site, order: 1 }] })).toThrow('unique')
  })
})
