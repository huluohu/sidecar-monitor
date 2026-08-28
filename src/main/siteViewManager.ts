import { WebContentsView, session, BrowserWindow, app } from 'electron'
import type { AppConfig, SiteConfig, SiteState, SlotBounds } from '@shared/types'
import { applyNavigationPolicy, applySessionPolicy } from './navigationPolicy'
import { ReconcileQueue } from './reconcileQueue'
import { loadScheduler } from './loadScheduler'
import type { LoadToken } from './loadScheduler'
import { toSiteUserAgent } from '@shared/userAgent'

/**
 * Returns the effective load-timeout in milliseconds.
 *
 * Packaged builds always use the production default of 30 000 ms.
 * In unpackaged (dev/test) builds, the env var
 * SIDECAR_MONITOR_TEST_LOAD_TIMEOUT_MS may override the value.
 * Invalid or out-of-bounds values silently fall back to 30 000.
 *
 * Accepted range: 100 – 60 000 ms (inclusive).
 */
function resolveLoadTimeoutMs(): number {
  if (!app.isPackaged) {
    const raw = process.env['SIDECAR_MONITOR_TEST_LOAD_TIMEOUT_MS']
    if (raw !== undefined && raw !== '') {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 100 && n <= 60_000) return n
    }
  }
  return 30_000
}

const LOAD_TIMEOUT_MS = resolveLoadTimeoutMs()

interface ManagedSite {
  config: SiteConfig
  view: WebContentsView
  state: SiteState
  /** Non-null while the entry is waiting in the scheduler queue (not yet running). */
  loadToken: LoadToken | null
  /** True once the scheduler has called the load function (loadURL is running). */
  loadActive: boolean
  loadTimeoutHandle: ReturnType<typeof setTimeout> | null
  /** Set to true when a load timeout fires; guards against subsequent event overwrites. */
  timedOut: boolean
  /** Set to true in destroySite to guard post-destroy event handlers. */
  destroyed: boolean
}

interface ReconcileRequest {
  config: AppConfig
  generation: number
}

class SiteViewManager {
  private sites = new Map<string, ManagedSite>()
  private window: BrowserWindow | null = null
  private lastBounds = new Map<string, SlotBounds>()
  private stateChangeCb?: (state: SiteState) => void
  private focusedId: string | null = null
  private globallyVisible = true

  /**
   * True while the settings drawer is open.
   * During this time, reconcile calls are deferred to pendingConfig.
   */
  private settingsOpen = false
  private pendingConfigWhileSettingsOpen: AppConfig | null = null

  /** Coalesced visibility scheduling — avoids calling setVisible in the same
   *  sync stack as WebContentsView creation / loadURL. */
  private visibilityScheduled = false
  private generation = 0

  private reconcileQueue = new ReconcileQueue<ReconcileRequest>(
    request => request.generation === this.generation
      ? this._doReconcile(request.config)
      : Promise.resolve(),
  )

  setWindow(win: BrowserWindow | null): void {
    this.window = win
  }

  setStateChangeCallback(cb: (state: SiteState) => void): void {
    this.stateChangeCb = cb
  }

  private emit(id: string): void {
    const m = this.sites.get(id)
    if (m) this.stateChangeCb?.({ ...m.state })
  }

  /**
   * Notify SiteViewManager that the settings drawer opened or closed.
   *
   * - Open  → hide all site views (so they don't overlap the drawer) and
   *           defer any incoming reconcile calls.
   * - Close → restore visibility and apply any pending reconcile that arrived
   *           while the drawer was open.
   */
  setSettingsOpen(open: boolean): void {
    this.settingsOpen = open
    this.globallyVisible = !open
    if (!open) {
      if (this.pendingConfigWhileSettingsOpen !== null) {
        const cfg = this.pendingConfigWhileSettingsOpen
        this.pendingConfigWhileSettingsOpen = null
        this.enqueueReconcile(cfg)
      }
    }
    this.scheduleVisibility()
  }

  /**
   * Schedule a config reconcile.
   * - If settings are open: store as pending (latest wins), don't touch views now.
   * - Otherwise: hand off to the serial ReconcileQueue.
   */
  scheduleReconcile(config: AppConfig): void {
    if (this.settingsOpen) {
      this.pendingConfigWhileSettingsOpen = config
      return
    }
    this.enqueueReconcile(config)
  }

  private enqueueReconcile(config: AppConfig): void {
    this.reconcileQueue.schedule({ config, generation: this.generation })
  }

  /**
   * Convenience alias kept for initial startup call (settings never open at that point).
   * @deprecated use scheduleReconcile
   */
  syncConfig(config: AppConfig): void {
    this.scheduleReconcile(config)
  }

  private async _doReconcile(config: AppConfig): Promise<void> {
    const wantedIds = new Set(
      config.sites.filter(s => s.enabled).map(s => s.id),
    )

    // Destroy views for sites no longer in config.
    for (const id of [...this.sites.keys()]) {
      if (!wantedIds.has(id)) this.destroySite(id)
    }
    if (this.focusedId && !wantedIds.has(this.focusedId)) {
      this.focusedId = null
    }

    // Sort by order to preserve visual sequence.
    const ordered = [...config.sites]
      .filter(s => s.enabled)
      .sort((a, b) => a.order - b.order)

    for (const siteConfig of ordered) {
      if (this.sites.has(siteConfig.id)) {
        const m = this.sites.get(siteConfig.id)!
        if (m.config.url !== siteConfig.url) {
          // URL changed — recreate view.
          const savedBounds = this.lastBounds.get(siteConfig.id)
          this.destroySite(siteConfig.id)
          this.createSite(siteConfig)
          if (savedBounds) this.setBoundsAll([savedBounds])
          continue
        }
        if (m.config.zoomFactor !== siteConfig.zoomFactor) {
          m.view.webContents.setZoomFactor(siteConfig.zoomFactor)
        }
        m.config = siteConfig
        m.state.title = siteConfig.name
        this.emit(siteConfig.id)
        continue
      }
      // New site — create view. Any error is per-site, does not block others.
      try {
        this.createSite(siteConfig)
      } catch (err) {
        console.error(`[SiteViewManager] Failed to create site ${siteConfig.id}:`, err)
      }
    }
    // Visibility is scheduled inside createSite; no extra call needed here.
  }

  private createSite(config: SiteConfig): void {
    const partition = `persist:site-${config.id}`
    const sess = session.fromPartition(partition)

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        session: sess,
      },
    })

    // Start off-screen until renderer sends real bounds.
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 })

    const state: SiteState = {
      id: config.id,
      status: 'loading',
      title: config.name,
      canGoBack: false,
    }
    const managed: ManagedSite = {
      config,
      view,
      state,
      loadToken: null,
      loadActive: false,
      loadTimeoutHandle: null,
      timedOut: false,
      destroyed: false,
    }
    this.sites.set(config.id, managed)
    if (this.window) {
      this.window.contentView.addChildView(view)
    }

    const wc = view.webContents
    wc.setUserAgent(toSiteUserAgent(wc.getUserAgent()))
    applyNavigationPolicy(wc, config.url)
    applySessionPolicy(wc)
    wc.setZoomFactor(config.zoomFactor)

    const markReady = (): void => {
      if (managed.destroyed) return
      if (managed.loadTimeoutHandle !== null) {
        clearTimeout(managed.loadTimeoutHandle)
        managed.loadTimeoutHandle = null
      }
      managed.timedOut = false
      managed.state.status = 'ready'
      managed.state.canGoBack = wc.canGoBack()
      managed.state.failReason = undefined
      this.scheduleVisibility()
      this.emit(config.id)
    }

    let releaseInitialLoad: (() => void) | null = null

    wc.on('did-start-navigation', details => {
      if (!details.isMainFrame || details.isSameDocument || managed.destroyed) return
      if (managed.loadTimeoutHandle !== null) {
        clearTimeout(managed.loadTimeoutHandle)
      }
      managed.timedOut = false
      managed.loadTimeoutHandle = setTimeout(() => {
        managed.loadTimeoutHandle = null
        if (managed.destroyed) return
        managed.timedOut = true
        try { wc.stop() } catch { /* view may already be closed */ }
        managed.state.status = 'failed'
        managed.state.failReason = '加载超时（30 秒）'
        this.scheduleVisibility()
        this.emit(config.id)
      }, LOAD_TIMEOUT_MS)
      managed.state.status = 'loading'
      this.scheduleVisibility()
      this.emit(config.id)
    })

    // A usable document may reach DOM ready even when optional third-party
    // resources remain pending indefinitely.
    wc.on('dom-ready', () => {
      markReady()
      releaseInitialLoad?.()
    })

    wc.on('did-finish-load', () => {
      markReady()
      releaseInitialLoad?.()
    })

    wc.on('did-fail-load', (_ev, errorCode, errorDesc, _url, isMainFrame) => {
      if (!isMainFrame) return
      if (errorCode === -3) return // ERR_ABORTED — e.g. after wc.stop() or timeout
      if (managed.destroyed) return
      if (managed.timedOut) return // timeout already set the state; don't overwrite
      if (managed.loadTimeoutHandle !== null) {
        clearTimeout(managed.loadTimeoutHandle)
        managed.loadTimeoutHandle = null
      }
      managed.state.status = 'failed'
      managed.state.failReason = errorDesc
      this.scheduleVisibility()
      this.emit(config.id)
    })

    wc.on('page-title-updated', (_ev, title) => {
      if (managed.destroyed) return
      managed.state.title = title || config.name
      this.emit(config.id)
    })

    wc.on('render-process-gone', (_ev, details) => {
      if (managed.destroyed) return
      console.warn(`[SiteViewManager] render-process-gone: ${config.id}`, details.reason)
      if (managed.loadTimeoutHandle !== null) {
        clearTimeout(managed.loadTimeoutHandle)
        managed.loadTimeoutHandle = null
      }
      managed.state.status = 'crashed'
      managed.state.failReason = details.reason
      this.scheduleVisibility()
      this.emit(config.id)
    })

    wc.on('unresponsive', () => {
      if (managed.destroyed) return
      managed.state.status = 'unresponsive'
      this.scheduleVisibility()
      this.emit(config.id)
    })

    wc.on('responsive', () => {
      if (managed.destroyed) return
      if (managed.state.status === 'unresponsive') {
        managed.state.status = 'ready'
        managed.state.failReason = undefined
        this.scheduleVisibility()
        this.emit(config.id)
      }
    })

    // Schedule the loadURL call through the FIFO concurrency-limited scheduler.
    // The view is created and added to the window now; loadURL begins only when
    // a scheduler slot is available.
    managed.loadToken = loadScheduler.schedule(config.id, async () => {
      managed.loadActive = true
      managed.loadToken = null // no longer queued
      const domReadyPromise = new Promise<void>(resolve => {
        releaseInitialLoad = resolve
      })
      const loadPromise = wc.loadURL(config.url).catch((err: unknown) => {
        // did-fail-load handles state updates in most cases.
        // Fallback: set failed state if nothing else handled it yet.
        if (!managed.destroyed && !managed.timedOut) {
          const code =
            typeof err === 'object' && err !== null && 'code' in err
              ? String((err as { code: unknown }).code)
              : ''
          if (code !== 'ERR_ABORTED') {
            if (
              managed.state.status !== 'failed' &&
              managed.state.status !== 'crashed' &&
              managed.state.status !== 'unresponsive'
            ) {
              managed.state.status = 'failed'
              managed.state.failReason = code || String(err)
              this.scheduleVisibility()
              this.emit(config.id)
            }
          }
        }
      })
      try {
        await Promise.race([loadPromise, domReadyPromise])
      } finally {
        managed.loadActive = false
        releaseInitialLoad = null
      }
    })

    // Schedule visibility AFTER scheduling the load so setVisible is not called
    // in the same synchronous stack as WebContentsView construction.
    this.scheduleVisibility()
  }

  private destroySite(id: string): void {
    const m = this.sites.get(id)
    if (!m) return

    m.destroyed = true

    // Cancel from scheduler queue if the load hasn't started yet.
    loadScheduler.cancelById(id)

    // Clear the load timeout.
    if (m.loadTimeoutHandle !== null) {
      clearTimeout(m.loadTimeoutHandle)
      m.loadTimeoutHandle = null
    }

    // If loadURL is running, stop it so the promise settles and the
    // scheduler slot is released automatically via the finally handler.
    if (m.loadActive) {
      try { m.view.webContents.stop() } catch { /* view may already be closed */ }
    }

    if (this.window) {
      try {
        this.window.contentView.removeChildView(m.view)
      } catch { /* may already be removed */ }
    }
    try {
      ;(m.view.webContents as { close?: () => void }).close?.()
    } catch { /* ignore */ }

    this.sites.delete(id)
    this.lastBounds.delete(id)
  }

  setBoundsAll(bounds: SlotBounds[]): void {
    for (const slot of bounds) {
      const m = this.sites.get(slot.id)
      if (!m) continue
      m.view.setBounds({
        x: Math.round(slot.x),
        y: Math.round(slot.y),
        width: Math.max(0, Math.round(slot.width)),
        height: Math.max(0, Math.round(slot.height)),
      })
      this.lastBounds.set(slot.id, slot)
    }
  }

  focus(id: string): void {
    if (!this.sites.has(id)) return
    this.focusedId = id
    this.scheduleVisibility()
  }

  unfocus(): void {
    this.focusedId = null
    this.scheduleVisibility()
  }

  /** Called by IPC SITES_SET_VISIBLE; encodes settings open/close state. */
  setGloballyVisible(visible: boolean): void {
    this.globallyVisible = visible
    this.scheduleVisibility()
  }

  /**
   * Coalesced visibility update scheduled via setImmediate so that setVisible
   * is never called in the same synchronous stack as view creation.
   * Also guards against views destroyed between scheduling and execution.
   */
  private scheduleVisibility(): void {
    if (this.visibilityScheduled) return
    this.visibilityScheduled = true
    setImmediate(() => {
      this.visibilityScheduled = false
      this._applyVisibility()
    })
  }

  private _applyVisibility(): void {
    for (const [id, managed] of this.sites) {
      if (!this.sites.has(id)) continue // destroyed while setImmediate was pending
      const { status } = managed.state
      // The native view always renders above the renderer overlay; only show
      // it once the document is ready so the loading animation stays visible.
      const isLoaded = status === 'ready'
      const isFocused = this.focusedId === null || this.focusedId === id
      try {
        managed.view.setVisible(this.globallyVisible && isLoaded && isFocused)
      } catch {
        // View may have been destroyed between scheduling and this tick.
      }
    }
  }

  refresh(id: string): void {
    const m = this.sites.get(id)
    if (!m) return
    m.state.status = 'loading'
    this.emit(id)
    m.view.webContents.reload()
  }

  refreshAll(): void {
    Array.from(this.sites.keys()).forEach((id, index) => {
      setTimeout(() => this.refresh(id), index * 250)
    })
  }

  recover(id: string): void {
    const m = this.sites.get(id)
    if (!m) return
    if (m.state.status === 'crashed' || m.state.status === 'unresponsive') {
      const config = { ...m.config }
      const savedBounds = this.lastBounds.get(id)
      this.destroySite(id)
      this.createSite(config)
      if (savedBounds) {
        const newM = this.sites.get(id)
        if (newM) {
          newM.view.setBounds({
            x: Math.round(savedBounds.x),
            y: Math.round(savedBounds.y),
            width: Math.max(0, Math.round(savedBounds.width)),
            height: Math.max(0, Math.round(savedBounds.height)),
          })
        }
      }
    } else {
      this.refresh(id)
    }
  }

  setZoom(id: string, factor: number): void {
    const m = this.sites.get(id)
    if (!m) return
    const clamped = Math.max(0.1, Math.min(5.0, factor))
    m.view.webContents.setZoomFactor(clamped)
    m.config = { ...m.config, zoomFactor: clamped }
  }

  goBack(id: string): void {
    const m = this.sites.get(id)
    if (m?.view.webContents.canGoBack()) {
      m.view.webContents.goBack()
    }
  }

  async clearSessionData(id: string): Promise<void> {
    const managed = this.sites.get(id)
    const sess = managed
      ? managed.view.webContents.session
      : session.fromPartition(`persist:site-${id}`)
    await Promise.all([sess.clearStorageData(), sess.clearCache()])
  }

  getStates(): SiteState[] {
    return Array.from(this.sites.values()).map(m => ({ ...m.state }))
  }

  destroy(): void {
    // Invalidate any reconcile already deferred by ReconcileQueue.
    this.generation++
    for (const id of [...this.sites.keys()]) this.destroySite(id)
    this.focusedId = null
    this.globallyVisible = true
    this.settingsOpen = false
    this.pendingConfigWhileSettingsOpen = null
    this.window = null
  }
}

export const siteViewManager = new SiteViewManager()
