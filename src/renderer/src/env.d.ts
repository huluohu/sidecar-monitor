/// <reference types="vite/client" />

import type { AppConfig, SiteState, SlotBounds, AppMetrics } from '@shared/types'

export interface MonitorAPI {
  platform: NodeJS.Platform
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<void>
  importConfig: () => Promise<AppConfig | null>
  exportConfig: () => Promise<void>
  getSiteStates: () => Promise<SiteState[]>
  refreshSite: (id: string) => Promise<void>
  refreshAll: () => Promise<void>
  focusSite: (id: string | null) => Promise<void>
  setSiteZoom: (id: string, factor: number) => Promise<void>
  recoverSite: (id: string) => Promise<void>
  goBack: (id: string) => Promise<void>
  clearSiteData: (id: string) => Promise<void>
  setSiteViewsVisible: (visible: boolean) => Promise<void>
  moveSite: (id: string, direction: 'up' | 'down') => Promise<void>
  setBounds: (bounds: SlotBounds[]) => Promise<void>
  getMetrics: () => Promise<AppMetrics>
  toggleFullscreen: () => Promise<void>
  onSiteStateChanged: (cb: (state: SiteState) => void) => () => void
  onConfigChanged: (cb: (config: AppConfig) => void) => () => void
  onMetricsUpdate: (cb: (metrics: AppMetrics) => void) => () => void
}

declare global {
  interface Window {
    monitorAPI: MonitorAPI
  }
}
