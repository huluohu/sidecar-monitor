import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageBoxOptions } from 'electron'
import type { ProgressInfo } from 'electron-updater'

vi.mock('electron', () => ({
  app: { isPackaged: false, getVersion: () => '0.1.7' },
  dialog: { showMessageBox: vi.fn() },
  shell: { openExternal: vi.fn() },
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on: vi.fn(),
    off: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}))

import { runUpdateFlow } from '../src/main/updateManager'
import type {
  UpdateAdapter,
  UpdateFlowDependencies,
} from '../src/main/updateManager'
import { RELEASES_URL } from '../src/main/updateChecker'

const progress: ProgressInfo = {
  total: 1_000,
  delta: 500,
  transferred: 500,
  percent: 50,
  bytesPerSecond: 100,
}

function createHarness(overrides: Partial<UpdateFlowDependencies> = {}) {
  let progressHandler: ((value: ProgressInfo) => void) | null = null
  const updater: UpdateAdapter = {
    checkForUpdates: vi.fn().mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '0.2.0' },
    }),
    downloadUpdate: vi.fn().mockImplementation(async () => {
      progressHandler?.(progress)
      return ['/tmp/update']
    }),
    quitAndInstall: vi.fn(),
    onProgress: vi.fn(handler => {
      progressHandler = handler
    }),
    offProgress: vi.fn(handler => {
      if (progressHandler === handler) progressHandler = null
    }),
  }
  const showMessage = vi.fn<(options: MessageBoxOptions) => Promise<number>>()
    .mockResolvedValue(0)
  const openExternal = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined)
  const setProgress = vi.fn<(value: number) => void>()
  const scheduleInstall = vi.fn<(install: () => void) => void>(install => install())
  const checkVersion = vi.fn<typeof import('../src/main/updateChecker').checkForUpdates>()
    .mockResolvedValue({
      currentVersion: '0.1.7',
      latestVersion: '0.2.0',
      updateAvailable: true,
      releaseUrl: RELEASES_URL,
    })

  const deps: UpdateFlowDependencies = {
    isPackaged: true,
    currentVersion: '0.1.7',
    updater,
    checkVersion,
    showMessage,
    openExternal,
    setProgress,
    scheduleInstall,
    ...overrides,
  }
  return {
    deps,
    updater,
    showMessage,
    openExternal,
    setProgress,
    scheduleInstall,
    checkVersion,
  }
}

describe('runUpdateFlow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports that a packaged application is up to date', async () => {
    const harness = createHarness()
    vi.mocked(harness.updater.checkForUpdates).mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '0.1.7' },
    })

    await expect(runUpdateFlow(harness.deps)).resolves.toBe('up-to-date')
    expect(harness.showMessage).toHaveBeenCalledWith(expect.objectContaining({
      message: 'You’re up to date',
    }))
    expect(harness.updater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('downloads with progress and schedules restart installation', async () => {
    const harness = createHarness()
    harness.showMessage.mockResolvedValueOnce(0).mockResolvedValueOnce(0)

    await expect(runUpdateFlow(harness.deps)).resolves.toBe('installing')
    expect(harness.updater.downloadUpdate).toHaveBeenCalledOnce()
    expect(harness.setProgress.mock.calls.map(call => call[0])).toEqual([2, 0.5, -1])
    expect(harness.updater.offProgress).toHaveBeenCalledOnce()
    expect(harness.scheduleInstall).toHaveBeenCalledOnce()
    expect(harness.updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('keeps a downloaded update for installation on a later check', async () => {
    const harness = createHarness()
    harness.showMessage.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

    await expect(runUpdateFlow(harness.deps)).resolves.toBe('downloaded')
    expect(harness.updater.downloadUpdate).toHaveBeenCalledOnce()
    expect(harness.updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('allows postponing before download', async () => {
    const harness = createHarness()
    harness.showMessage.mockResolvedValueOnce(2)

    await expect(runUpdateFlow(harness.deps)).resolves.toBe('deferred')
    expect(harness.updater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('opens the manual download page when requested', async () => {
    const harness = createHarness()
    harness.showMessage.mockResolvedValueOnce(1)

    await expect(runUpdateFlow(harness.deps)).resolves.toBe('manual-download')
    expect(harness.openExternal).toHaveBeenCalledWith(RELEASES_URL)
    expect(harness.updater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('cleans up progress and offers a fallback when download fails', async () => {
    const harness = createHarness()
    vi.mocked(harness.updater.downloadUpdate).mockRejectedValue(new Error('network lost'))
    harness.showMessage.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

    await expect(runUpdateFlow(harness.deps)).resolves.toBe('failed')
    expect(harness.updater.offProgress).toHaveBeenCalledOnce()
    expect(harness.setProgress).toHaveBeenLastCalledWith(-1)
    expect(harness.showMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      message: 'Unable to download or install the update',
      detail: expect.stringContaining('network lost'),
    }))
  })

  it('uses the lightweight release check in development builds', async () => {
    const harness = createHarness({ isPackaged: false })
    harness.showMessage.mockResolvedValueOnce(0)

    await expect(runUpdateFlow(harness.deps)).resolves.toBe('manual-download')
    expect(harness.checkVersion).toHaveBeenCalledWith('0.1.7')
    expect(harness.updater.checkForUpdates).not.toHaveBeenCalled()
    expect(harness.openExternal).toHaveBeenCalledWith(RELEASES_URL)
  })
})

