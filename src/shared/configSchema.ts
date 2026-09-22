/**
 * Config schema, validation, and migration — no Electron deps, fully testable.
 */
import type { AppConfig, LayoutMode, SiteConfig } from './types'

export const SCHEMA_VERSION = 2 as const

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: 2,
  sites: [],
  columns: 'auto',
  layoutMode: 'grid',
  stageSiteId: null,
  fullscreenOnLaunch: false,
}

export function isHttpUrl(url: string): boolean {
  try {
    const p = new URL(url)
    return (
      (p.protocol === 'http:' || p.protocol === 'https:') &&
      p.hostname.length > 0 &&
      p.username === '' &&
      p.password === ''
    )
  } catch {
    return false
  }
}

export function validateSite(s: unknown): s is SiteConfig {
  if (!s || typeof s !== 'object') return false
  const o = s as Record<string, unknown>
  return (
    typeof o.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(o.id) &&
    typeof o.name === 'string' && o.name.trim().length > 0 && o.name.length <= 200 &&
    typeof o.url === 'string' && isHttpUrl(o.url) &&
    typeof o.enabled === 'boolean' &&
    typeof o.order === 'number' && Number.isInteger(o.order) && o.order >= 0 &&
    typeof o.zoomFactor === 'number' && o.zoomFactor >= 0.1 && o.zoomFactor <= 5.0
  )
}

export function validateColumns(v: unknown): v is number | 'auto' {
  if (v === 'auto') return true
  return (
    typeof v === 'number' &&
    Number.isInteger(v) &&
    v >= 1 &&
    v <= 20
  )
}

export function validateLayoutMode(v: unknown): v is LayoutMode {
  return v === 'grid' || v === 'stage' || v === 'main-stack'
}

/** Clamp to the valid zoom range (0.1–5.0) and round to the UI step of 0.1. */
export function normalizeZoomFactor(value: number): number {
  const clamped = Math.max(0.1, Math.min(5.0, value))
  return Math.round(clamped * 10) / 10
}

/**
 * Parse and validate a raw config object, returning a clean AppConfig.
 * Accepts schemaVersion 1 (migrated in place: layout fields get defaults) and 2.
 * Throws on invalid input so broken configuration is never partially applied.
 */
export function parseConfig(raw: unknown): AppConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Config must be an object')
  }
  const o = raw as Record<string, unknown>

  if (o.schemaVersion !== 1 && o.schemaVersion !== 2) {
    throw new Error(`Unsupported schemaVersion: ${String(o.schemaVersion)}`)
  }
  if (!Array.isArray(o.sites)) {
    throw new Error('sites must be an array')
  }
  if (!validateColumns(o.columns)) {
    throw new Error('Invalid columns')
  }
  if (typeof o.fullscreenOnLaunch !== 'boolean') {
    throw new Error('Invalid fullscreenOnLaunch')
  }

  let layoutMode: LayoutMode = 'grid'
  let stageSiteId: string | null = null
  if (o.schemaVersion === 2) {
    if (!validateLayoutMode(o.layoutMode)) {
      throw new Error('Invalid layoutMode')
    }
    layoutMode = o.layoutMode
    if (o.stageSiteId !== null && typeof o.stageSiteId !== 'string') {
      throw new Error('Invalid stageSiteId')
    }
  }

  const sites = (o.sites as unknown[]).map((site, index) => {
    if (!validateSite(site)) {
      throw new Error(`Invalid site at index ${index}`)
    }
    return { ...site, name: site.name.trim() }
  }) as SiteConfig[]
  if (new Set(sites.map(site => site.id)).size !== sites.length) {
    throw new Error('Site IDs must be unique')
  }

  // A dangling stage reference (site removed/disabled, or ids regenerated on
  // import) falls back to null rather than failing the whole config.
  if (typeof o.stageSiteId === 'string' && sites.some(site => site.id === o.stageSiteId)) {
    stageSiteId = o.stageSiteId
  }

  return {
    schemaVersion: 2,
    sites,
    columns: o.columns,
    layoutMode,
    stageSiteId,
    fullscreenOnLaunch: o.fullscreenOnLaunch,
  }
}
