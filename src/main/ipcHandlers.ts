import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import { IPC } from '@shared/types'
import type { SlotBounds } from '@shared/types'
import { parseConfig } from '@shared/configSchema'
import { configStore } from './configStore'
import { siteViewManager } from './siteViewManager'
import { syncColumnsMenu } from './appMenu'

/** Only accept IPC from the main window's own renderer. */
function fromMainWindow(event: Electron.IpcMainInvokeEvent, win: BrowserWindow): boolean {
  return event.sender === win.webContents
}

function validateSlotBounds(b: unknown): b is SlotBounds {
  if (!b || typeof b !== 'object') return false
  const o = b as Record<string, unknown>
  return (
    typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 128 &&
    typeof o.x === 'number' && Number.isFinite(o.x) && o.x >= -10000 && o.x <= 15000 &&
    typeof o.y === 'number' && Number.isFinite(o.y) && o.y >= -10000 && o.y <= 15000 &&
    typeof o.width === 'number' && Number.isFinite(o.width) && o.width >= 0 && o.width <= 8192 &&
    typeof o.height === 'number' && Number.isFinite(o.height) && o.height >= 0 && o.height <= 8192
  )
}

function validateSiteId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128
}

export function registerIpcHandlers(win: BrowserWindow): () => void {
  const cs = configStore
  const svm = siteViewManager

  ipcMain.handle(IPC.CONFIG_GET, (event) => {
    if (!fromMainWindow(event, win)) return null
    return cs.get()
  })

  /**
   * CONFIG_SAVE: persist config, then schedule a reconcile and return immediately.
   *
   * Key properties:
   * - Does NOT call svm.syncConfig() synchronously (would create/mount views before returning).
   * - Does NOT send CONFIG_CHANGED back to the saving renderer (avoids nested invoke).
   * - Renderer updates its local config.value after the returned promise resolves.
   * - SiteViewManager reconcile (which may create WebContentsViews) runs asynchronously
   *   via the serial ReconcileQueue after this handler returns.
   */
  ipcMain.handle(IPC.CONFIG_SAVE, (event, raw: unknown) => {
    if (!fromMainWindow(event, win)) return
    try {
      const config = parseConfig(raw)
      cs.save(config)
      svm.scheduleReconcile(config)
      syncColumnsMenu(config.columns)
      // Return without sending CONFIG_CHANGED — the invoking renderer will update
      // its own store from the return value or its local mutation.
    } catch (err) {
      throw new Error(`Invalid config: ${(err as Error).message}`)
    }
  })

  ipcMain.handle(IPC.CONFIG_IMPORT, async (event) => {
    if (!fromMainWindow(event, win)) return null
    const { filePaths } = await dialog.showOpenDialog(win, {
      title: 'Import Config',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (!filePaths[0]) return null
    const { readFileSync } = await import('node:fs')
    const raw = JSON.parse(readFileSync(filePaths[0], 'utf-8')) as unknown
    return cs.importFrom(raw)
  })

  ipcMain.handle(IPC.CONFIG_EXPORT, async (event) => {
    if (!fromMainWindow(event, win)) return
    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Config',
      defaultPath: 'sidecar-monitor-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!filePath) return
    const { writeFileSync } = await import('node:fs')
    writeFileSync(filePath, JSON.stringify(cs.export(), null, 2), 'utf-8')
  })

  ipcMain.handle(IPC.SITES_GET_STATES, (event) => {
    if (!fromMainWindow(event, win)) return []
    return svm.getStates()
  })

  ipcMain.handle(IPC.SITE_REFRESH, (event, id: unknown) => {
    if (!fromMainWindow(event, win)) return
    if (!validateSiteId(id)) return
    svm.refresh(id)
  })

  ipcMain.handle(IPC.SITE_REFRESH_ALL, (event) => {
    if (!fromMainWindow(event, win)) return
    svm.refreshAll()
  })

  ipcMain.handle(IPC.SITE_FOCUS, (event, id: unknown) => {
    if (!fromMainWindow(event, win)) return
    if (id === null || id === undefined) {
      svm.unfocus()
    } else if (validateSiteId(id)) {
      svm.focus(id)
    }
  })

  ipcMain.handle(IPC.SITE_SET_ZOOM, (event, id: unknown, factor: unknown) => {
    if (!fromMainWindow(event, win)) return
    if (!validateSiteId(id)) return
    if (typeof factor !== 'number' || !Number.isFinite(factor)) return
    svm.setZoom(id, factor)
    // Persist zoom in config and broadcast the updated config (zoom changes
    // are main-initiated, not via CONFIG_SAVE, so CONFIG_CHANGED is safe here).
    const config = cs.get()
    const idx = config.sites.findIndex(s => s.id === id)
    if (idx !== -1) {
      config.sites[idx] = {
        ...config.sites[idx],
        zoomFactor: Math.max(0.1, Math.min(5, factor as number)),
      }
      cs.save(config)
      win.webContents.send(IPC.CONFIG_CHANGED, config)
    }
  })

  ipcMain.handle(IPC.SITE_RECOVER, (event, id: unknown) => {
    if (!fromMainWindow(event, win)) return
    if (!validateSiteId(id)) return
    svm.recover(id)
  })

  ipcMain.handle(IPC.SITE_GO_BACK, (event, id: unknown) => {
    if (!fromMainWindow(event, win)) return
    if (!validateSiteId(id)) return
    svm.goBack(id)
  })

  ipcMain.handle(IPC.SITE_CLEAR_DATA, async (event, id: unknown) => {
    if (!fromMainWindow(event, win)) return
    if (!validateSiteId(id)) return
    await svm.clearSessionData(id)
  })

  /**
   * SITES_SET_VISIBLE: called when the settings drawer opens (visible=false) or
   * closes (visible=true).  We delegate to setSettingsOpen so that SiteViewManager
   * can defer reconciles while the drawer is open and flush them on close.
   */
  ipcMain.handle(IPC.SITES_SET_VISIBLE, (event, visible: unknown) => {
    if (!fromMainWindow(event, win)) return
    if (typeof visible !== 'boolean') return
    // visible=false → settings opened; visible=true → settings closed
    svm.setSettingsOpen(!visible)
  })

  ipcMain.handle(IPC.LAYOUT_SET_BOUNDS, (event, rawBounds: unknown) => {
    if (!fromMainWindow(event, win)) return
    if (!Array.isArray(rawBounds)) return
    const valid = rawBounds.filter(validateSlotBounds)
    if (valid.length !== rawBounds.length) {
      console.warn('[IPC] layout:set-bounds: some entries failed validation')
    }
    svm.setBoundsAll(valid)
  })

  ipcMain.handle(IPC.APP_GET_METRICS, (event) => {
    if (!fromMainWindow(event, win)) return null
    try {
      const metrics = app.getAppMetrics()
      const totalKB = metrics.reduce((s, m) => s + m.memory.workingSetSize, 0)
      const states = svm.getStates()
      return {
        siteCount: states.length,
        failedCount: states.filter(s => s.status === 'failed' || s.status === 'crashed' || s.status === 'unresponsive').length,
        memoryMB: Math.round(totalKB / 1024),
      }
    } catch {
      return { siteCount: 0, failedCount: 0, memoryMB: 0 }
    }
  })

  ipcMain.handle(IPC.APP_GET_FULLSCREEN, (event) => {
    if (!fromMainWindow(event, win)) return false
    return win.isFullScreen()
  })

  ipcMain.handle(IPC.APP_TOGGLE_FULLSCREEN, (event) => {
    if (!fromMainWindow(event, win)) return
    win.setFullScreen(!win.isFullScreen())
  })

  ipcMain.handle(IPC.APP_MOVE_SITE, (event, id: unknown, direction: unknown) => {
    if (!fromMainWindow(event, win)) return
    if (!validateSiteId(id)) return
    if (direction !== 'up' && direction !== 'down') return

    const config = cs.get()
    const idx = config.sites.findIndex(s => s.id === id)
    if (idx === -1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= config.sites.length) return

    const sites = [...config.sites]
    const tmp = sites[idx].order
    sites[idx] = { ...sites[idx], order: sites[swapIdx].order }
    sites[swapIdx] = { ...sites[swapIdx], order: tmp }
    ;[sites[idx], sites[swapIdx]] = [sites[swapIdx], sites[idx]]

    const newConfig = { ...config, sites }
    cs.save(newConfig)
    // Move is main-initiated — reconcile without deferral and broadcast change.
    svm.scheduleReconcile(newConfig)
    win.webContents.send(IPC.CONFIG_CHANGED, newConfig)
  })

  return () => {
    for (const channel of [
      IPC.CONFIG_GET,
      IPC.CONFIG_SAVE,
      IPC.CONFIG_IMPORT,
      IPC.CONFIG_EXPORT,
      IPC.SITES_GET_STATES,
      IPC.SITE_REFRESH,
      IPC.SITE_REFRESH_ALL,
      IPC.SITE_FOCUS,
      IPC.SITE_SET_ZOOM,
      IPC.SITE_RECOVER,
      IPC.SITE_GO_BACK,
      IPC.SITE_CLEAR_DATA,
      IPC.SITES_SET_VISIBLE,
      IPC.LAYOUT_SET_BOUNDS,
      IPC.APP_GET_METRICS,
      IPC.APP_GET_FULLSCREEN,
      IPC.APP_TOGGLE_FULLSCREEN,
      IPC.APP_MOVE_SITE,
    ]) {
      ipcMain.removeHandler(channel)
    }
  }
}
