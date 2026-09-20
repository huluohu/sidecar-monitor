import { app, dialog, shell } from 'electron'
import type { BrowserWindow, MessageBoxOptions } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo } from 'electron-updater'
import { checkForUpdates, RELEASES_URL } from './updateChecker'

interface UpdateInfoLike {
  version: string
}

interface UpdateCheckResultLike {
  isUpdateAvailable: boolean
  updateInfo: UpdateInfoLike
}

export interface UpdateAdapter {
  checkForUpdates: () => Promise<UpdateCheckResultLike | null>
  downloadUpdate: () => Promise<string[]>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
  onProgress: (handler: (progress: ProgressInfo) => void) => void
  offProgress: (handler: (progress: ProgressInfo) => void) => void
}

export interface UpdateFlowDependencies {
  isPackaged: boolean
  currentVersion: string
  updater: UpdateAdapter
  checkVersion: typeof checkForUpdates
  showMessage: (options: MessageBoxOptions) => Promise<number>
  openExternal: (url: string) => Promise<void>
  setProgress: (progress: number) => void
  scheduleInstall: (install: () => void) => void
}

export type UpdateFlowResult =
  | 'up-to-date'
  | 'deferred'
  | 'downloaded'
  | 'installing'
  | 'manual-download'
  | 'failed'

async function showFailure(
  deps: UpdateFlowDependencies,
  error: unknown,
): Promise<UpdateFlowResult> {
  deps.setProgress(-1)
  const response = await deps.showMessage({
    type: 'error',
    title: 'Update Failed',
    message: 'Unable to download or install the update',
    detail: `${error instanceof Error ? error.message : String(error)}\n\nYou can download the installer manually from GitHub Releases.`,
    buttons: ['Open Download Page', 'OK'],
    defaultId: 0,
    cancelId: 1,
  })
  if (response === 0) {
    await deps.openExternal(RELEASES_URL)
    return 'manual-download'
  }
  return 'failed'
}

async function runDevelopmentCheck(
  deps: UpdateFlowDependencies,
): Promise<UpdateFlowResult> {
  const result = await deps.checkVersion(deps.currentVersion)
  if (!result.updateAvailable) {
    await deps.showMessage({
      type: 'info',
      title: 'Check for Updates',
      message: 'You’re up to date',
      detail: `Sidecar Monitor v${result.currentVersion} is the latest version.`,
      buttons: ['OK'],
    })
    return 'up-to-date'
  }

  const response = await deps.showMessage({
    type: 'info',
    title: 'Update Available',
    message: `Sidecar Monitor v${result.latestVersion} is available`,
    detail: 'Automatic installation is available in packaged builds. Open the download page?',
    buttons: ['Open Download Page', 'Later'],
    defaultId: 0,
    cancelId: 1,
  })
  if (response === 0) {
    await deps.openExternal(result.releaseUrl)
    return 'manual-download'
  }
  return 'deferred'
}

export async function runUpdateFlow(
  deps: UpdateFlowDependencies,
): Promise<UpdateFlowResult> {
  if (!deps.isPackaged) {
    try {
      return await runDevelopmentCheck(deps)
    } catch (error) {
      return showFailure(deps, error)
    }
  }

  try {
    const checkResult = await deps.updater.checkForUpdates()
    if (!checkResult) throw new Error('The updater is not configured for this build')

    if (!checkResult.isUpdateAvailable) {
      await deps.showMessage({
        type: 'info',
        title: 'Check for Updates',
        message: 'You’re up to date',
        detail: `Sidecar Monitor v${deps.currentVersion} is the latest version.`,
        buttons: ['OK'],
      })
      return 'up-to-date'
    }

    const latestVersion = checkResult.updateInfo.version
    const downloadResponse = await deps.showMessage({
      type: 'info',
      title: 'Update Available',
      message: `Sidecar Monitor v${latestVersion} is available`,
      detail: `You’re currently using v${deps.currentVersion}. Download the update now?`,
      buttons: ['Download Update', 'Open Download Page', 'Later'],
      defaultId: 0,
      cancelId: 2,
    })
    if (downloadResponse === 1) {
      await deps.openExternal(RELEASES_URL)
      return 'manual-download'
    }
    if (downloadResponse !== 0) return 'deferred'

    deps.setProgress(2)
    const onProgress = (progress: ProgressInfo) => {
      const ratio = Number.isFinite(progress.percent)
        ? Math.max(0, Math.min(1, progress.percent / 100))
        : 2
      deps.setProgress(ratio)
    }
    deps.updater.onProgress(onProgress)
    try {
      await deps.updater.downloadUpdate()
    } finally {
      deps.updater.offProgress(onProgress)
      deps.setProgress(-1)
    }

    const installResponse = await deps.showMessage({
      type: 'info',
      title: 'Update Ready',
      message: `Sidecar Monitor v${latestVersion} has been downloaded`,
      detail: 'Restart the application to install the update. Unsaved work in monitored pages may be lost.',
      buttons: ['Restart and Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (installResponse !== 0) return 'downloaded'

    deps.scheduleInstall(() => deps.updater.quitAndInstall(false, true))
    return 'installing'
  } catch (error) {
    return showFailure(deps, error)
  }
}

let activeUpdate: Promise<UpdateFlowResult> | null = null
let updaterConfigured = false

function configureUpdater(): void {
  if (updaterConfigured) return
  updaterConfigured = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.disableWebInstaller = true
  autoUpdater.logger = console
  // Avoid EventEmitter's special unhandled-error behavior; the active promise
  // still rejects and presents the error to the user.
  autoUpdater.on('error', error => console.error('[Updater]', error))
}

function showMessage(
  getMainWindow: () => BrowserWindow | null,
  options: MessageBoxOptions,
): Promise<number> {
  const win = getMainWindow()
  const promise = win && !win.isDestroyed()
    ? dialog.showMessageBox(win, options)
    : dialog.showMessageBox(options)
  return promise.then(result => result.response)
}

export function startUpdateFlow(getMainWindow: () => BrowserWindow | null): void {
  if (activeUpdate) return
  configureUpdater()

  const adapter: UpdateAdapter = {
    checkForUpdates: () => autoUpdater.checkForUpdates(),
    downloadUpdate: () => autoUpdater.downloadUpdate(),
    quitAndInstall: (isSilent, isForceRunAfter) => {
      autoUpdater.quitAndInstall(isSilent, isForceRunAfter)
    },
    onProgress: handler => autoUpdater.on('download-progress', handler),
    offProgress: handler => autoUpdater.off('download-progress', handler),
  }

  activeUpdate = runUpdateFlow({
    isPackaged: app.isPackaged,
    currentVersion: app.getVersion(),
    updater: adapter,
    checkVersion: checkForUpdates,
    showMessage: options => showMessage(getMainWindow, options),
    openExternal: url => shell.openExternal(url),
    setProgress: progress => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) win.setProgressBar(progress)
    },
    scheduleInstall: install => setImmediate(install),
  })
    .catch((error): UpdateFlowResult => {
      console.error('[Updater] Update flow failed:', error)
      return 'failed'
    })
    .finally(() => {
      activeUpdate = null
    })
}

