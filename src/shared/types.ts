// Types shared between main, preload, and renderer

export type SiteStatus = 'loading' | 'ready' | 'failed' | 'crashed' | 'unresponsive'

export interface SiteConfig {
  id: string
  name: string
  url: string
  enabled: boolean
  order: number
  zoomFactor: number
}

export interface AppConfig {
  schemaVersion: 1
  sites: SiteConfig[]
  columns: number | 'auto'
  fullscreenOnLaunch: boolean
}

export interface SiteState {
  id: string
  status: SiteStatus
  title: string
  canGoBack: boolean
  failReason?: string
}

export interface SlotBounds {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface AppMetrics {
  siteCount: number
  failedCount: number
  memoryMB: number
}

// Commands sent from the native menu (main) to the renderer.
export type MenuCommand =
  | { type: 'open-settings' }
  | { type: 'import-config' }
  | { type: 'export-config' }
  | { type: 'refresh-all' }
  | { type: 'toggle-fullscreen' }
  | { type: 'set-columns'; columns: number | 'auto' }

export const IPC = {
  // renderer → main (invoke)
  CONFIG_GET: 'config:get',
  CONFIG_SAVE: 'config:save',
  CONFIG_IMPORT: 'config:import',
  CONFIG_EXPORT: 'config:export',
  SITES_GET_STATES: 'sites:get-states',
  SITE_REFRESH: 'site:refresh',
  SITE_REFRESH_ALL: 'site:refresh-all',
  SITE_FOCUS: 'site:focus',
  SITE_SET_ZOOM: 'site:set-zoom',
  SITE_RECOVER: 'site:recover',
  SITE_GO_BACK: 'site:go-back',
  SITE_CLEAR_DATA: 'site:clear-data',
  SITES_SET_VISIBLE: 'sites:set-visible',
  LAYOUT_SET_BOUNDS: 'layout:set-bounds',
  APP_GET_METRICS: 'app:get-metrics',
  APP_GET_FULLSCREEN: 'app:get-fullscreen',
  APP_TOGGLE_FULLSCREEN: 'app:toggle-fullscreen',
  APP_MOVE_SITE: 'app:move-site',
  // main → renderer (send)
  SITE_STATE_CHANGED: 'site-state-changed',
  CONFIG_CHANGED: 'config-changed',
  METRICS_UPDATE: 'metrics-update',
  FULLSCREEN_CHANGED: 'fullscreen-changed',
  MENU_COMMAND: 'menu:command',
} as const
