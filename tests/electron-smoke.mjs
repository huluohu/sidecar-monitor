import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const userDataDir = join(projectDir, `.electron-smoke-user-data-${process.pid}-${Date.now()}`)
mkdirSync(userDataDir, { recursive: true })

/** Click a menu item by ID via the actual native menu, exercising the real click handler. */
function clickMenuItemById(electronApp, id) {
  return electronApp.evaluate(({ Menu, BrowserWindow }, itemId) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) throw new Error('No application menu set')
    const item = menu.getMenuItemById(itemId)
    if (!item) throw new Error(`Menu item not found: ${itemId}`)
    const win = BrowserWindow.getAllWindows()[0] ?? null
    item.click(item, win, {})
  }, id)
}

/**
 * Poll `page.evaluate(predicate)` until it returns truthy or the timeout elapses.
 * Use this instead of `page.waitForFunction` for predicates that call contextBridge
 * IPC helpers (which return Promises that waitForFunction does not correctly await).
 */
async function pollUntil(page, predicate, { timeout = 10_000, interval = 50 } = {}) {
  const deadline = Date.now() + timeout
  while (true) {
    const result = await page.evaluate(predicate)
    if (result) return
    if (Date.now() > deadline) throw new Error(`pollUntil timed out after ${timeout} ms`)
    await new Promise(r => setTimeout(r, interval))
  }
}

// ── Test servers ─────────────────────────────────────────────────────────────

let embyNativePluginRequests = 0
let embyBackgroundScriptRequests = 0

// Fast server: immediate responses; special routes support redirect and Emby compatibility tests.
const server = createServer((req, res) => {
  if (req.url === '/missing-externalplayer.js') {
    embyNativePluginRequests++
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('missing native plugin')
  } else if (req.url === '/emby-background.js') {
    embyBackgroundScriptRequests++
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      res.end('globalThis.embyBackgroundLoaded = true')
    }, 6500)
  } else if (req.url === '/emby-sim') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html>
      <title>Emby Startup</title>
      <main id="splash">Starting Emby</main>
      <script>
        if (/Electron\\//i.test(navigator.userAgent)) {
          const plugin = document.createElement('script')
          plugin.src = '/missing-externalplayer.js'
          document.head.append(plugin)
        } else {
          location.hash = '#!/startup/manuallogin.html'
          document.querySelector('main').innerHTML =
            '<label>Username <input name="username"></label>' +
            '<label>Password <input name="password" type="password"></label>' +
            '<button>Login</button>'
          document.title = 'Emby Login'
          addEventListener('load', () => setTimeout(() => {
            const background = document.createElement('script')
            background.src = '/emby-background.js'
            document.head.append(background)
          }))
        }
      </script>`)
  } else if (req.url === '/landing') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><title>Landing Page</title><main>landed</main>')
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><title>Test site</title><main>ready</main>')
  }
})

// Slow server: 1000 ms artificial delay; tracks concurrent active requests for max-2 assertion.
// 1000 ms sits well within the 5000 ms SIDECAR_MONITOR_TEST_LOAD_TIMEOUT_MS floor, leaving
// ample headroom for renderer startup and localhost round-trip even on a loaded CI machine.
// The scheduler's max-2 cap is asserted via slowMaxActive ≤ 2.
let slowActive = 0
let slowMaxActive = 0
const slowServer = createServer((_req, res) => {
  slowActive++
  if (slowActive > slowMaxActive) slowMaxActive = slowActive
  setTimeout(() => {
    slowActive--
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><title>Slow Site</title><main>ready</main>')
  }, 1000)
})

// Hang server: sends response headers and flushes them, then never sends the body.
// Simulates a stalled document that exercises the load-timeout path in siteViewManager.
const hangSockets = new Set()
const hangServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.flushHeaders() // Ensure headers reach the browser so a real load starts
  // Intentionally do NOT call res.end() — connection hangs until wc.stop() or test teardown
})
hangServer.on('connection', socket => {
  hangSockets.add(socket)
  socket.once('close', () => hangSockets.delete(socket))
})

// Redirect server: issues a 302 cross-origin redirect to fastServer /landing.
// Declared here; the server is created inside the try once fastServer's port is known.
let redirectServer

let electronApp
try {
  // Start fast, slow, and hang servers in parallel before launching Electron.
  await Promise.all(
    [server, slowServer, hangServer].map(
      s => new Promise((ok, fail) => { s.once('error', fail); s.listen(0, '127.0.0.1', ok) }),
    ),
  )

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fast server did not expose a port')
  const slowAddress = slowServer.address()
  if (!slowAddress || typeof slowAddress === 'string') throw new Error('Slow server did not expose a port')
  const hangAddress = hangServer.address()
  if (!hangAddress || typeof hangAddress === 'string') throw new Error('Hang server did not expose a port')

  // Redirect server needs the fast-server port for its Location header, so create it now.
  redirectServer = createServer((_req, res) => {
    res.writeHead(302, { Location: `http://127.0.0.1:${address.port}/landing` })
    res.end()
  })
  await new Promise((ok, fail) => { redirectServer.once('error', fail); redirectServer.listen(0, '127.0.0.1', ok) })
  const redirectAddress = redirectServer.address()
  if (!redirectAddress || typeof redirectAddress === 'string') throw new Error('Redirect server did not expose a port')

  electronApp = await electron.launch({
    executablePath: electronPath,
    args: [projectDir],
    env: {
      ...process.env,
      SIDECAR_MONITOR_USER_DATA: userDataDir,
      SIDECAR_MONITOR_DISABLE_LEGACY_MIGRATION: '1',
      // Override load timeout for deterministic smoke tests (honored only when !app.isPackaged).
      // Production / packaged timeout remains exactly 30 000 ms.
      SIDECAR_MONITOR_TEST_LOAD_TIMEOUT_MS: '5000',
    },
  })

  const page = await electronApp.firstWindow()

  // ── App name, window title, page title ────────────────────────────────────
  const runtimeTitles = await electronApp.evaluate(({ app, BrowserWindow }) => ({
    appName: app.getName(),
    windowTitle: BrowserWindow.getAllWindows()[0]?.getTitle(),
  }))
  if (runtimeTitles.appName !== 'Sidecar Monitor') {
    throw new Error(`Expected app name 'Sidecar Monitor', got '${runtimeTitles.appName}'`)
  }
  if (runtimeTitles.windowTitle !== 'Sidecar Monitor') {
    throw new Error(
      `Expected native window title 'Sidecar Monitor', got '${runtimeTitles.windowTitle}'`,
    )
  }

  const pageTitle = await page.title()
  if (pageTitle !== 'Sidecar Monitor') {
    throw new Error(`Expected page title 'Sidecar Monitor', got '${pageTitle}'`)
  }

  const toolbarTitle = await page.locator('.toolbar-title').textContent()
  if (!toolbarTitle?.includes('Sidecar Monitor')) {
    throw new Error(`Expected toolbar title to include 'Sidecar Monitor', got '${toolbarTitle}'`)
  }

  const runtimePlatform = await page.evaluate(() => window.monitorAPI.platform)
  const toolbarMetrics = await page.locator('.toolbar').evaluate(element => {
    const style = getComputedStyle(element)
    return {
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
      isMacOS: element.classList.contains('toolbar--macos'),
      usesWindowControlsOverlay: element.classList.contains('toolbar--window-overlay'),
    }
  })
  if (runtimePlatform === 'darwin') {
    if (
      !toolbarMetrics.isMacOS ||
      toolbarMetrics.usesWindowControlsOverlay ||
      toolbarMetrics.paddingLeft < 80
    ) {
      throw new Error(
        `Expected macOS toolbar safe area, got ${JSON.stringify(toolbarMetrics)}`,
      )
    }
  } else {
    if (
      toolbarMetrics.isMacOS ||
      !toolbarMetrics.usesWindowControlsOverlay ||
      toolbarMetrics.paddingLeft < 12 ||
      toolbarMetrics.paddingRight < 100
    ) {
      throw new Error(
        `Expected Window Controls Overlay safe area, got ${JSON.stringify(toolbarMetrics)}`,
      )
    }
    const overlay = await page.evaluate(() => {
      const controls = navigator.windowControlsOverlay
      return controls
        ? {
            supported: true,
            visible: controls.visible,
            width: controls.getTitlebarAreaRect().width,
          }
        : { supported: false, visible: false, width: 0 }
    })
    if (!overlay.supported || !overlay.visible || overlay.width <= 0) {
      throw new Error(`Window Controls Overlay unavailable: ${JSON.stringify(overlay)}`)
    }
  }

  const toolbarLogoCount = await page.locator('.toolbar-logo').count()
  const expectedToolbarLogoCount = runtimePlatform === 'darwin' ? 1 : 0
  if (toolbarLogoCount !== expectedToolbarLogoCount) {
    throw new Error(
      `Expected ${expectedToolbarLogoCount} toolbar logos on ${runtimePlatform}, received ${toolbarLogoCount}`,
    )
  }

  // ── Assert native menu: version label ─────────────────────────────────────
  const menuVersion = await electronApp.evaluate(({ Menu, app }) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) return null
    const version = app.getVersion()
    function searchVersion(items) {
      for (const item of items) {
        if (item.label?.includes(version)) return version
        if (item.submenu) {
          const found = searchVersion(item.submenu.items)
          if (found) return found
        }
      }
      return null
    }
    return searchVersion(menu.items)
  })
  if (!menuVersion) {
    throw new Error('Native application menu should exist and contain the app version string')
  }
  console.log(`Menu version label found: ${menuVersion}`)

  // ── Validate platform-specific menu structure and required item IDs ────────
  const menuAssertion = await electronApp.evaluate(({ Menu, app }) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) throw new Error('No application menu set')
    const platform = process.platform
    const firstLabel = menu.items[0]?.label ?? ''
    const expectedFirstLabel = platform === 'darwin' ? app.getName() : 'File'
    return {
      platform,
      firstLabel,
      expectedFirstLabel,
      hasSettings: !!menu.getMenuItemById('settings'),
      hasRefreshAll: !!menu.getMenuItemById('refresh-all'),
      hasToggleFullscreen: !!menu.getMenuItemById('toggle-fullscreen'),
      hasImportConfig: !!menu.getMenuItemById('import-config'),
      hasExportConfig: !!menu.getMenuItemById('export-config'),
      hasAbout: !!menu.getMenuItemById('about'),
      hasHomepage: !!menu.getMenuItemById('homepage'),
      hasLayoutAuto: !!menu.getMenuItemById('layout-auto'),
      hasLayout4: !!menu.getMenuItemById('layout-4'),
      hasLayout20: !!menu.getMenuItemById('layout-20'),
    }
  })
  if (menuAssertion.firstLabel !== menuAssertion.expectedFirstLabel) {
    throw new Error(
      `Platform menu structure: expected first item '${menuAssertion.expectedFirstLabel}' ` +
        `on ${menuAssertion.platform}, got '${menuAssertion.firstLabel}'`,
    )
  }
  for (const [key, val] of Object.entries(menuAssertion)) {
    if (key.startsWith('has') && !val) {
      throw new Error(`Menu ID assertion failed: ${key} is false (platform: ${menuAssertion.platform})`)
    }
  }
  console.log(`Menu structure validated on ${menuAssertion.platform}`)

  // ── Verify toggle-fullscreen IPC is wired (no OS fullscreen needed) ────────
  const toggleResult = await page.evaluate(() =>
    window.monitorAPI.toggleFullscreen().then(() => 'ok', e => String(e)),
  )
  if (toggleResult !== 'ok') {
    throw new Error(`toggleFullscreen IPC failed: ${toggleResult}`)
  }
  // Restore window to non-fullscreen (it may not have entered it in headless).
  await electronApp.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w?.isFullScreen()) w.setFullScreen(false)
  })

  // ── Verify Escape input in renderer (existing behavior) ───────────────────
  const observedEscape = electronApp.evaluate(({ BrowserWindow }) =>
    new Promise((resolveInput, rejectInput) => {
      const window = BrowserWindow.getAllWindows()[0]
      if (!window) {
        rejectInput(new Error('Main window not found'))
        return
      }
      const timer = setTimeout(
        () => rejectInput(new Error('Main window did not receive Escape')),
        5_000,
      )
      window.webContents.once('before-input-event', (_event, input) => {
        clearTimeout(timer)
        resolveInput({ type: input.type, key: input.key })
      })
    }),
  )
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: 'Escape',
    })
  })
  const escapeInput = await observedEscape
  if (escapeInput.type !== 'keyDown' || escapeInput.key !== 'Escape') {
    throw new Error(`Unexpected Escape input: ${JSON.stringify(escapeInput)}`)
  }

  // ── Add 5 sites via Settings drawer ───────────────────────────────────────
  await page.locator('button[title="设置"]').click()

  for (let index = 1; index <= 5; index++) {
    await page.getByRole('button', { name: '添加' }).click()
    const modal = page.locator('.modal')
    await modal.locator('input[type="text"]').fill(`Site ${index}`)
    await modal.locator('input[type="url"]').fill(
      `http://127.0.0.1:${address.port}/site-${index}`,
    )
    await modal.getByRole('button', { name: '保存' }).click()
    try {
      await modal.waitFor({ state: 'detached', timeout: 3_000 })
    } catch (error) {
      const [modalText, config] = await Promise.all([
        modal.textContent(),
        page.evaluate(() => window.monitorAPI.getConfig()),
      ])
      throw new Error(
        `Save ${index} did not close. Modal: ${modalText}; persisted sites: ${config.sites.length}`,
        { cause: error },
      )
    }

    const rowCount = await page.locator('.site-row').count()
    if (rowCount !== index) {
      throw new Error(`Expected ${index} site rows after save, received ${rowCount}`)
    }
  }

  const savedCount = await page.evaluate(() => window.monitorAPI.getConfig().then(c => c.sites.length))
  if (savedCount !== 5) throw new Error(`Expected 5 persisted sites, received ${savedCount}`)

  await page.locator('.drawer-header button[title="关闭"]').click()
  await page.waitForFunction(
    () => window.monitorAPI.getSiteStates().then(states => states.length === 5),
    undefined,
    { timeout: 10_000 },
  )

  const metrics = await page.evaluate(() => window.monitorAPI.getMetrics())
  if (metrics.siteCount !== 5) {
    throw new Error(`Expected 5 live site views, received ${metrics.siteCount}`)
  }

  // ── Refresh All via toolbar (existing behavior) ────────────────────────────
  await page.locator('button[title="全部刷新"]').click()
  const confirmModal = page.locator('.confirm-modal')
  await confirmModal.waitFor({ state: 'visible', timeout: 3_000 })
  await confirmModal.getByRole('button', { name: '取消' }).click()
  await confirmModal.waitFor({ state: 'detached', timeout: 3_000 })

  // ── Settings via native menu item click ───────────────────────────────────
  await clickMenuItemById(electronApp, 'settings')
  const drawer = page.locator('.drawer-overlay')
  await drawer.waitFor({ state: 'visible', timeout: 3_000 })
  console.log('Menu settings: Settings drawer opened')

  await page.locator('.drawer-header button[title="关闭"]').click()
  await drawer.waitFor({ state: 'detached', timeout: 3_000 })
  console.log('Menu settings: Settings drawer closed')

  // ── Refresh All via native menu item click ─────────────────────────────────
  await clickMenuItemById(electronApp, 'refresh-all')
  const menuConfirmModal = page.locator('.confirm-modal')
  await menuConfirmModal.waitFor({ state: 'visible', timeout: 3_000 })
  console.log('Menu refresh-all: ConfirmDialog appeared')
  await menuConfirmModal.getByRole('button', { name: '取消' }).click()
  await menuConfirmModal.waitFor({ state: 'detached', timeout: 3_000 })
  console.log('Menu refresh-all: ConfirmDialog cancelled')

  // ── Layout column via native menu item click; verify config and radio ──────
  await clickMenuItemById(electronApp, 'layout-4')
  await page.waitForFunction(
    () => window.monitorAPI.getConfig().then(c => c.columns === 4),
    undefined,
    { timeout: 5_000 },
  )
  console.log('Menu layout-4: config updated')

  const checkedLayoutId = await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    const layoutMenu = menu?.items.find(i => i.label === 'Layout')
    const checked = layoutMenu?.submenu?.items.find(i => i.checked)
    return checked?.id ?? null
  })
  if (checkedLayoutId !== 'layout-4') {
    throw new Error(`Expected Layout menu to have 'layout-4' checked, got '${checkedLayoutId}'`)
  }
  console.log('Menu layout-4: Layout radio item checked correctly')

  // Restore columns to auto.
  await clickMenuItemById(electronApp, 'layout-auto')
  await page.waitForFunction(
    () => window.monitorAPI.getConfig().then(c => c.columns === 'auto'),
    undefined,
    { timeout: 5_000 },
  )

  // ── Deterministic complex-site integration tests ───────────────────────────
  // Open settings to batch-add: 3 slow sites, 1 hang, 1 redirect, and 1 Emby simulation.
  await page.locator('button[title="设置"]').click()
  const complexDrawer = page.locator('.drawer-overlay')
  await complexDrawer.waitFor({ state: 'visible', timeout: 3_000 })

  // 3 slow sites — exercises the max-2 LoadScheduler concurrency limit.
  for (let i = 1; i <= 3; i++) {
    await page.getByRole('button', { name: '添加' }).click()
    const modal = page.locator('.modal')
    await modal.locator('input[type="text"]').fill(`Slow ${i}`)
    await modal.locator('input[type="url"]').fill(`http://127.0.0.1:${slowAddress.port}/slow-${i}`)
    await modal.getByRole('button', { name: '保存' }).click()
    try {
      await modal.waitFor({ state: 'detached', timeout: 3_000 })
    } catch (err) {
      throw new Error(`Save 'Slow ${i}' modal did not close`, { cause: err })
    }
  }

  // 1 hang site — main document never finishes; triggers load-timeout path.
  {
    await page.getByRole('button', { name: '添加' }).click()
    const modal = page.locator('.modal')
    await modal.locator('input[type="text"]').fill('Hang 1')
    await modal.locator('input[type="url"]').fill(`http://127.0.0.1:${hangAddress.port}/hang`)
    await modal.getByRole('button', { name: '保存' }).click()
    try {
      await modal.waitFor({ state: 'detached', timeout: 3_000 })
    } catch (err) {
      throw new Error(`Save 'Hang 1' modal did not close`, { cause: err })
    }
  }

  // 1 redirect site — server-side 302 to a cross-origin (different port) landing page.
  {
    await page.getByRole('button', { name: '添加' }).click()
    const modal = page.locator('.modal')
    await modal.locator('input[type="text"]').fill('Redirect 1')
    await modal.locator('input[type="url"]').fill(`http://127.0.0.1:${redirectAddress.port}/start`)
    await modal.getByRole('button', { name: '保存' }).click()
    try {
      await modal.waitFor({ state: 'detached', timeout: 3_000 })
    } catch (err) {
      throw new Error(`Save 'Redirect 1' modal did not close`, { cause: err })
    }
  }

  // Emby simulation — Electron UA triggers a missing native-only plugin and leaves
  // the splash screen stuck; a browser UA proceeds to the login route.
  {
    await page.getByRole('button', { name: '添加' }).click()
    const modal = page.locator('.modal')
    await modal.locator('input[type="text"]').fill('Emby simulation')
    await modal.locator('input[type="url"]').fill(`http://127.0.0.1:${address.port}/emby-sim`)
    await modal.getByRole('button', { name: '保存' }).click()
    try {
      await modal.waitFor({ state: 'detached', timeout: 3_000 })
    } catch (err) {
      throw new Error(`Save 'Emby simulation' modal did not close`, { cause: err })
    }
  }

  await page.locator('.drawer-header button[title="关闭"]').click()
  await complexDrawer.waitFor({ state: 'detached', timeout: 3_000 })

  // ── Concurrency: all 3 slow sites must reach ready; scheduler max-2 enforced ──
  // Use pollUntil instead of waitForFunction: waitForFunction does not correctly
  // await contextBridge IPC Promises (it sees the Promise object as truthy and
  // passes immediately).  pollUntil drives page.evaluate in the test process.
  //
  // Wait for title "Slow Site" (the <title> set by the actual slow-server HTML)
  // to avoid a false-positive from an about:blank load that keeps the config title.
  await pollUntil(
    page,
    () => window.monitorAPI.getSiteStates().then(states =>
      states.filter(s => s.title === 'Slow Site' && s.status === 'ready').length === 3,
    ),
    { timeout: 10_000 },
  )
  if (slowMaxActive > 2) {
    throw new Error(
      `LoadScheduler max-2 violated: saw ${slowMaxActive} concurrent loads (expected ≤2)`,
    )
  }
  console.log(`Concurrency test passed: max simultaneous loads = ${slowMaxActive} (≤2), all 3 slow sites reached ready`)

  // ── Timeout: hang site must reach failed with the exact production reason string ─
  // siteViewManager always uses the fixed string '加载超时（30 秒）' regardless of
  // the actual timeout duration used in tests (test clock is 3 s).
  await pollUntil(
    page,
    () => window.monitorAPI.getSiteStates().then(states =>
      states.some(s => s.title === 'Hang 1' && s.status === 'failed' && s.failReason === '加载超时（30 秒）'),
    ),
    { timeout: 9_000 },
  )
  // Verify the main renderer and native menu remain responsive after the hang/timeout.
  const rendererAlive = await page.evaluate(() => typeof window.monitorAPI !== 'undefined')
  if (!rendererAlive) throw new Error('Renderer became unresponsive during load-timeout test')
  const menuAliveAfterHang = await electronApp.evaluate(({ Menu }) => !!Menu.getApplicationMenu())
  if (!menuAliveAfterHang) throw new Error('Application menu disappeared during load-timeout test')
  console.log('Timeout test passed: hang site → failed "加载超时（30 秒）"; renderer+menu remain responsive')

  // ── Redirect: site must reach ready at the cross-origin final URL ──────────
  // After the 302 from redirectServer, the view lands on fastServer /landing.
  // The page title "Landing Page" (from the HTML) confirms the load completed.
  const landingUrl = `http://127.0.0.1:${address.port}/landing`
  await pollUntil(
    page,
    () => window.monitorAPI.getSiteStates().then(states =>
      states.some(s => s.title === 'Landing Page' && s.status === 'ready'),
    ),
    { timeout: 10_000 },
  )
  const foundLandingUrl = await electronApp.evaluate(
    ({ webContents }, url) =>
      webContents.getAllWebContents().find(w => w.getURL() === url)?.getURL() ?? null,
    landingUrl,
  )
  if (foundLandingUrl !== landingUrl) {
    throw new Error(
      `Redirect site: expected final URL ${landingUrl}, got ${String(foundLandingUrl)}`,
    )
  }
  console.log(`Redirect test passed: site reached cross-origin final URL ${landingUrl}`)

  // ── Browser identity: Emby simulation must enter login without native plugin ─
  const embySimUrl = `http://127.0.0.1:${address.port}/emby-sim`
  let embyBrowserState
  const embyDeadline = Date.now() + 10_000
  while (Date.now() <= embyDeadline) {
    embyBrowserState = await electronApp.evaluate(
      async ({ webContents }, url) => {
        const wc = webContents.getAllWebContents().find(w => w.getURL().startsWith(url))
        if (!wc) return null
        return wc.executeJavaScript(`({
          href: location.href,
          userAgent: navigator.userAgent,
          title: document.title,
          hasUsername: !!document.querySelector('input[name="username"]'),
          hasPassword: !!document.querySelector('input[name="password"]'),
          hasLogin: [...document.querySelectorAll('button')].some(button => button.textContent === 'Login')
        })`)
      },
      embySimUrl,
    )
    if (
      embyBrowserState?.href.includes('#!/startup/manuallogin.html') &&
      embyBrowserState.hasUsername &&
      embyBrowserState.hasPassword &&
      embyBrowserState.hasLogin
    ) {
      break
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 50))
  }
  if (!embyBrowserState?.href.includes('#!/startup/manuallogin.html')) {
    throw new Error(`Emby simulation did not enter login: ${JSON.stringify(embyBrowserState)}`)
  }
  if (/Electron|sidecar-monitor/i.test(embyBrowserState.userAgent)) {
    throw new Error(`Site user agent leaked app identity: ${embyBrowserState.userAgent}`)
  }
  if (embyNativePluginRequests !== 0) {
    throw new Error(`Emby simulation requested native plugin ${embyNativePluginRequests} time(s)`)
  }
  await new Promise(resolveWait => setTimeout(resolveWait, 5500))
  const embyStateAfterBackgroundLoad = await page.evaluate(() =>
    window.monitorAPI.getSiteStates().then(states =>
      states.find(state => state.title === 'Emby Login') ?? null,
    ),
  )
  if (embyBackgroundScriptRequests !== 1 || embyStateAfterBackgroundLoad?.status !== 'ready') {
    throw new Error(
      'Background resource changed a usable Emby page state: ' +
        JSON.stringify({ embyBackgroundScriptRequests, embyStateAfterBackgroundLoad }),
    )
  }
  console.log('Browser identity test passed: Emby simulation entered login with standard Chromium UA')

  // ── Cross-origin block: renderer-initiated navigation to original origin must be blocked ─
  // After the 302 redirect, trustedOrigin = fastServer origin.
  // A script navigating to redirectServer origin (different port) must be blocked by
  // navigationPolicy's will-navigate handler.
  const attackUrl = `http://127.0.0.1:${redirectAddress.port}/attack`
  const crossOriginResult = await electronApp.evaluate(
    ({ webContents }, { landingUrl, attackUrl }) =>
      new Promise((resolve) => {
        const wc = webContents.getAllWebContents().find(w => w.getURL() === landingUrl)
        if (!wc) { resolve({ error: 'webContents not found at landingUrl' }); return }
        let navigatedAway = false
        // did-navigate fires only if the navigation commits; a blocked navigation
        // never reaches commit, so this listener should NOT fire.
        wc.once('did-navigate', (_e, url) => { if (url !== landingUrl) navigatedAway = true })
        // Trigger a renderer-initiated cross-origin navigation attempt.
        wc.executeJavaScript(
          `void(window.location.href = ${JSON.stringify(attackUrl)})`,
        ).catch(() => {})
        // 600 ms is well beyond the synchronous block; if did-navigate hasn't fired by then,
        // the navigation was prevented.
        setTimeout(() => resolve({ blocked: !navigatedAway, url: wc.getURL() }), 600)
      }),
    { landingUrl, attackUrl },
  )
  if (crossOriginResult.error) {
    throw new Error(`Cross-origin block test setup error: ${crossOriginResult.error}`)
  }
  if (!crossOriginResult.blocked) {
    throw new Error(
      `Cross-origin renderer navigation was NOT blocked; URL became: ${crossOriginResult.url}`,
    )
  }
  console.log(`Cross-origin block test passed: renderer navigation to ${attackUrl} was blocked`)

  console.log(
    'Electron smoke passed: menu/sites/concurrency(max-2)/timeout(加载超时)/redirect/cross-origin/Emby-UA all verified',
  )
} finally {
  if (electronApp) await electronApp.close()
  // Destroy any open hang-server sockets before closing (prevents server.close from hanging).
  for (const sock of hangSockets) { try { sock.destroy() } catch { /* ignore */ } }
  const allServers = [server, slowServer, hangServer, ...(redirectServer ? [redirectServer] : [])]
  await Promise.all(allServers.map(s => new Promise(r => s.close(r))))
  rmSync(userDataDir, { recursive: true, force: true })
}
