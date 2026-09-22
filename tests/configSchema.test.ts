import { describe, it, expect } from 'vitest'
import { parseConfig, validateSite, isHttpUrl, normalizeZoomFactor, validateLayoutMode, DEFAULT_CONFIG } from '../src/shared/configSchema'
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
    schemaVersion: 2,
    sites: [],
    columns: 'auto',
    layoutMode: 'grid',
    stageSiteId: null,
    fullscreenOnLaunch: false,
  }

  function makeSite(id: string, order: number) {
    return { id, name: `Site ${id}`, url: 'https://example.com', enabled: true, order, zoomFactor: 1 }
  }

  it('parses a minimal valid config', () => {
    expect(parseConfig(minimal)).toMatchObject(minimal)
  })

  it('throws on non-object', () => {
    expect(() => parseConfig(null)).toThrow()
    expect(() => parseConfig('string')).toThrow()
  })

  it('throws on unknown schemaVersion', () => {
    expect(() => parseConfig({ ...minimal, schemaVersion: 3 })).toThrow('schemaVersion')
  })

  it('migrates schemaVersion 1 to 2 with layout defaults', () => {
    const v1 = {
      schemaVersion: 1,
      sites: [],
      columns: 3,
      fullscreenOnLaunch: true,
    }
    expect(parseConfig(v1)).toEqual({
      schemaVersion: 2,
      sites: [],
      columns: 3,
      layoutMode: 'grid',
      stageSiteId: null,
      fullscreenOnLaunch: true,
    })
  })

  it('rejects invalid layoutMode in v2', () => {
    expect(() => parseConfig({ ...minimal, layoutMode: 'carousel' })).toThrow('layoutMode')
    expect(() => parseConfig({ ...minimal, layoutMode: undefined })).toThrow('layoutMode')
    expect(parseConfig({ ...minimal, layoutMode: 'stage' }).layoutMode).toBe('stage')
    expect(parseConfig({ ...minimal, layoutMode: 'main-stack' }).layoutMode).toBe('main-stack')
  })

  it('rejects non-string non-null stageSiteId', () => {
    expect(() => parseConfig({ ...minimal, stageSiteId: 42 })).toThrow('stageSiteId')
    expect(parseConfig({ ...minimal, stageSiteId: null }).stageSiteId).toBe(null)
  })

  it('coerces dangling stageSiteId to null instead of failing', () => {
    const raw = {
      ...minimal,
      sites: [makeSite('a', 0)],
    }
    expect(parseConfig({ ...raw, stageSiteId: 'missing' }).stageSiteId).toBe(null)
    expect(parseConfig({ ...raw, stageSiteId: 'a' }).stageSiteId).toBe('a')
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

describe('validateLayoutMode', () => {
  it('accepts the three presets', () => {
    expect(validateLayoutMode('grid')).toBe(true)
    expect(validateLayoutMode('stage')).toBe(true)
    expect(validateLayoutMode('main-stack')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(validateLayoutMode('auto')).toBe(false)
    expect(validateLayoutMode('')).toBe(false)
    expect(validateLayoutMode(null)).toBe(false)
    expect(validateLayoutMode(undefined)).toBe(false)
  })
})

describe('DEFAULT_CONFIG', () => {
  it('is a valid v2 config', () => {
    expect(DEFAULT_CONFIG.schemaVersion).toBe(2)
    expect(DEFAULT_CONFIG.layoutMode).toBe('grid')
    expect(DEFAULT_CONFIG.stageSiteId).toBe(null)
    expect(parseConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG)
  })
})

describe('normalizeZoomFactor', () => {
  it('clamps to the valid range', () => {
    expect(normalizeZoomFactor(0)).toBe(0.1)
    expect(normalizeZoomFactor(-2)).toBe(0.1)
    expect(normalizeZoomFactor(6)).toBe(5)
    expect(normalizeZoomFactor(50)).toBe(5)
  })

  it('rounds to one decimal so ±0.1 steps do not accumulate float drift', () => {
    expect(normalizeZoomFactor(0.8 - 0.1)).toBe(0.7)
    expect(normalizeZoomFactor(0.1 + 0.2)).toBe(0.3)
    expect(normalizeZoomFactor(1.7000000000000002)).toBe(1.7)
    expect(normalizeZoomFactor(1)).toBe(1)
  })
})
