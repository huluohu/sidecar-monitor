import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import type { AppConfig, SiteState, SlotBounds, AppMetrics, MenuCommand } from '@shared/types'

/** Minimal API exposed to the trusted renderer via contextBridge. */
const monitorAPI = {
  platform: process.platform,

  // ── Config ────────────────────────────────────────────────────────────────
  getConfig: (): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.CONFIG_GET),

  saveConfig: (config: AppConfig): Promise<void> =>
    ipcRenderer.invoke(IPC.CONFIG_SAVE, config),

  importConfig: (): Promise<AppConfig | null> =>
    ipcRenderer.invoke(IPC.CONFIG_IMPORT),

  exportConfig: (): Promise<void> =>
    ipcRenderer.invoke(IPC.CONFIG_EXPORT),

  // ── Site control ─────────────────────────────────────────────────────────
  getSiteStates: (): Promise<SiteState[]> =>
    ipcRenderer.invoke(IPC.SITES_GET_STATES),

  refreshSite: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SITE_REFRESH, id),

  refreshAll: (): Promise<void> =>
    ipcRenderer.invoke(IPC.SITE_REFRESH_ALL),

  focusSite: (id: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC.SITE_FOCUS, id),

  setSiteZoom: (id: string, factor: number): Promise<void> =>
    ipcRenderer.invoke(IPC.SITE_SET_ZOOM, id, factor),

  recoverSite: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SITE_RECOVER, id),

  goBack: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SITE_GO_BACK, id),

  clearSiteData: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SITE_CLEAR_DATA, id),

  setSiteViewsVisible: (visible: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.SITES_SET_VISIBLE, visible),

  moveSite: (id: string, direction: 'up' | 'down'): Promise<void> =>
    ipcRenderer.invoke(IPC.APP_MOVE_SITE, id, direction),

  // ── Layout ───────────────────────────────────────────────────────────────
  setBounds: (bounds: SlotBounds[]): Promise<void> =>
    ipcRenderer.invoke(IPC.LAYOUT_SET_BOUNDS, bounds),

  // ── App ──────────────────────────────────────────────────────────────────
  getMetrics: (): Promise<AppMetrics> =>
    ipcRenderer.invoke(IPC.APP_GET_METRICS),

  toggleFullscreen: (): Promise<void> =>
    ipcRenderer.invoke(IPC.APP_TOGGLE_FULLSCREEN),

  // ── Push events from main ────────────────────────────────────────────────
  onSiteStateChanged: (cb: (state: SiteState) => void): (() => void) => {
    const handler = (_e: unknown, state: SiteState) => cb(state)
    ipcRenderer.on(IPC.SITE_STATE_CHANGED, handler)
    return () => ipcRenderer.off(IPC.SITE_STATE_CHANGED, handler)
  },

  onConfigChanged: (cb: (config: AppConfig) => void): (() => void) => {
    const handler = (_e: unknown, config: AppConfig) => cb(config)
    ipcRenderer.on(IPC.CONFIG_CHANGED, handler)
    return () => ipcRenderer.off(IPC.CONFIG_CHANGED, handler)
  },

  onMetricsUpdate: (cb: (metrics: AppMetrics) => void): (() => void) => {
    const handler = (_e: unknown, metrics: AppMetrics) => cb(metrics)
    ipcRenderer.on(IPC.METRICS_UPDATE, handler)
    return () => ipcRenderer.off(IPC.METRICS_UPDATE, handler)
  },

  onMenuCommand: (cb: (cmd: MenuCommand) => void): (() => void) => {
    const handler = (_e: unknown, cmd: MenuCommand) => cb(cmd)
    ipcRenderer.on(IPC.MENU_COMMAND, handler)
    return () => ipcRenderer.off(IPC.MENU_COMMAND, handler)
  },
}

contextBridge.exposeInMainWorld('monitorAPI', monitorAPI)

export type MonitorAPI = typeof monitorAPI
