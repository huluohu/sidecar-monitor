import { app, BrowserWindow, dialog, shell } from 'electron'
import { join, resolve } from 'path'
import { configStore } from './configStore'
import { siteViewManager } from './siteViewManager'
import { registerIpcHandlers } from './ipcHandlers'
import { migrateFromLegacy } from './legacyMigration'
import { buildAndSetMenu, configureAboutPanel } from './appMenu'
import { getWindowTitlebarOptions } from './windowTitlebar'
import { IPC } from '@shared/types'

const APP_NAME = 'Sidecar Monitor'

/**
 * Set the explicit userData path before any session or config operations.
 * Must happen before app.getPath('userData') is first used.
 */
app.setName(APP_NAME)
const testUserData = !app.isPackaged ? process.env['SIDECAR_MONITOR_USER_DATA'] : undefined
app.setPath(
  'userData',
  testUserData ? resolve(testUserData) : join(app.getPath('appData'), 'sidecar-monitor'),
)

let mainWindow: BrowserWindow | null = null
let migrationPromise: Promise<void> | null = null

async function ensureLegacyMigration(): Promise<void> {
  if (migrationPromise) return migrationPromise
  migrationPromise = (async () => {
    if (!app.isPackaged && process.env['SIDECAR_MONITOR_DISABLE_LEGACY_MIGRATION'] === '1') {
      return
    }
    try {
      const migrationResult = await migrateFromLegacy({
        newUserData: app.getPath('userData'),
        candidates: [
          join(app.getPath('appData'), 'site-wallboard'),
          join(app.getPath('appData'), 'Site Wallboard'),
        ],
      })
      if (!migrationResult.skipped && migrationResult.errors.length > 0) {
        dialog.showErrorBox(
          '旧数据迁移出现错误',
          `迁移旧 userData 时发生部分错误，下次启动会重试。` +
            `\n\n错误详情：\n${migrationResult.errors.join('\n')}`,
        )
      }
    } catch (error) {
      dialog.showErrorBox(
        '旧数据迁移失败',
        `迁移旧 userData 时发生意外错误，下次启动会重试。\n\n${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })()
  return migrationPromise
}

async function openWindow(): Promise<void> {
  await ensureLegacyMigration()
  if (mainWindow) return
  createWindow()
}

function createWindow(): void {
  const windowIcon = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : resolve('resources/icon.png')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: APP_NAME,
    backgroundColor: '#101722',
    icon: process.platform === 'darwin' ? undefined : windowIcon,
    ...getWindowTitlebarOptions(process.platform),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
    },
    show: false,
  })

  try {
    configStore.load()
  } catch (error) {
    dialog.showErrorBox(
      '配置文件无效',
      `无法读取场地配置，应用将以空配置启动。原文件不会被覆盖。\n\n${error instanceof Error ? error.message : String(error)}`,
    )
  }

  siteViewManager.setWindow(mainWindow)
  siteViewManager.setStateChangeCallback((state) => {
    mainWindow?.webContents.send(IPC.SITE_STATE_CHANGED, state)
  })
  // Schedule initial reconcile (settings are not open at startup).
  siteViewManager.scheduleReconcile(configStore.get())

  const unregisterIpcHandlers = registerIpcHandlers(mainWindow)

  // Build application menu after config is loaded.
  buildAndSetMenu(() => mainWindow)

  // Load renderer
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
    if (configStore.get().fullscreenOnLaunch) {
      mainWindow!.setFullScreen(true)
    }
  })

  mainWindow.on('closed', () => {
    clearInterval(metricsInterval)
    unregisterIpcHandlers()
    siteViewManager.destroy()
    mainWindow = null
  })

  // Periodically push metrics
  const metricsInterval = setInterval(() => {
    if (!mainWindow) return
    try {
      const metrics = app.getAppMetrics()
      const totalKB = metrics.reduce((s, m) => s + m.memory.workingSetSize, 0)
      const states = siteViewManager.getStates()
      mainWindow.webContents.send(IPC.METRICS_UPDATE, {
        siteCount: states.length,
        failedCount: states.filter(s => s.status === 'failed' || s.status === 'crashed' || s.status === 'unresponsive').length,
        memoryMB: Math.round(totalKB / 1024),
      })
    } catch {
      // ignore metrics errors
    }
  }, 5000)

  // Block navigation in the main window itself
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env['ELECTRON_RENDERER_URL']
    if (devServer && url.startsWith(devServer)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      openWindow().catch(console.error)
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(() => {
    configureAboutPanel(
      app.isPackaged
        ? join(process.resourcesPath, 'icon.png')
        : resolve('resources/icon.png'),
    )
    openWindow().catch(console.error)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow().catch(console.error)
    })
  }).catch(console.error)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Prevent additional windows
app.on('web-contents-created', (_event, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'Escape' || !mainWindow?.isFullScreen()) {
      return
    }
    event.preventDefault()
    mainWindow.setFullScreen(false)
  })
})
