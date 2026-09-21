import { app, Menu, shell, dialog } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { join, resolve } from 'node:path'
import { IPC } from '@shared/types'
import type { MenuCommand } from '@shared/types'
import { configStore } from './configStore'
import { startUpdateFlow } from './updateManager'

// ── Pure template builder (testable without Electron) ─────────────────────────

export interface MenuTemplateOpts {
  platform: NodeJS.Platform
  version: string
  appName: string
  columns: number | 'auto'
  onCommand: (cmd: MenuCommand) => void
  onAbout: () => void
  onHomepage: () => void
  onCheckUpdates: () => void
}

const COLUMN_VALUES: Array<number | 'auto'> = [
  'auto', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
]

export function buildMenuTemplate(opts: MenuTemplateOpts): MenuItemConstructorOptions[] {
  const {
    platform,
    version,
    appName,
    columns,
    onCommand,
    onAbout,
    onHomepage,
    onCheckUpdates,
  } = opts
  const isMac = platform === 'darwin'

  const layoutSubmenu: MenuItemConstructorOptions[] = COLUMN_VALUES.map(val => ({
    id: `layout-${val}`,
    label: val === 'auto' ? 'Auto' : `${val} Columns`,
    type: 'radio' as const,
    checked: columns === val,
    click: () => onCommand({ type: 'set-columns', columns: val }),
  }))

  const fileSubmenu: MenuItemConstructorOptions[] = [
    {
      id: 'import-config',
      label: 'Import Config',
      accelerator: 'CmdOrCtrl+Shift+I',
      click: () => onCommand({ type: 'import-config' }),
    },
    {
      id: 'export-config',
      label: 'Export Config',
      accelerator: 'CmdOrCtrl+Shift+E',
      click: () => onCommand({ type: 'export-config' }),
    },
  ]
  if (!isMac) {
    fileSubmenu.push(
      { type: 'separator' },
      {
        id: 'settings',
        label: 'Settings',
        accelerator: 'CmdOrCtrl+,',
        click: () => onCommand({ type: 'open-settings' }),
      },
      { type: 'separator' },
      { role: 'quit' },
    )
  }

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        {
          id: 'about',
          label: `About ${appName} v${version}`,
          click: onAbout,
        },
        { type: 'separator' },
        {
          id: 'settings',
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => onCommand({ type: 'open-settings' }),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  template.push(
    { label: 'File', submenu: fileSubmenu },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          id: 'refresh-all',
          label: 'Refresh All',
          accelerator: 'CmdOrCtrl+R',
          click: () => onCommand({ type: 'refresh-all' }),
        },
        { type: 'separator' },
        {
          id: 'toggle-fullscreen',
          label: 'Toggle Full Screen',
          accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
          click: () => onCommand({ type: 'toggle-fullscreen' }),
        },
      ],
    },
    { label: 'Layout', submenu: layoutSubmenu },
    {
      label: 'Window',
      submenu: isMac
        ? [
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' },
          ]
        : [{ role: 'minimize' }],
    },
    {
      label: 'Help',
      submenu: [
        {
          id: 'check-updates',
          label: 'Check for Updates…',
          click: onCheckUpdates,
        },
        { type: 'separator' },
        {
          id: 'homepage',
          label: 'Project Homepage',
          click: onHomepage,
        },
        ...(!isMac
          ? [
              { type: 'separator' as const },
              {
                id: 'about' as const,
                label: `About ${appName} v${version}`,
                click: onAbout,
              },
            ]
          : []),
      ],
    },
  )

  return template
}

// ── Runtime menu management ────────────────────────────────────────────────────

const APP_NAME = 'Sidecar Monitor'
const APP_HOMEPAGE_URL = 'https://github.com/huluohu/sidecar-monitor'

let getMainWindowFn: () => BrowserWindow | null = () => null

function sendCommand(cmd: MenuCommand): void {
  getMainWindowFn()?.webContents.send(IPC.MENU_COMMAND, cmd)
}

function openHomepage(): void {
  void shell.openExternal(APP_HOMEPAGE_URL).catch(error => {
    console.error('[Menu] Failed to open project homepage:', error)
  })
}

function showAbout(): void {
  const version = app.getVersion()
  const win = getMainWindowFn()
  const options: Electron.MessageBoxOptions = {
    type: 'info',
    // Custom dialog with the app icon on every platform: the native macOS
    // About panel always shows the bundle icon, which is Electron's in dev.
    icon: app.isPackaged
      ? join(process.resourcesPath, 'icon.png')
      : resolve('resources/icon.png'),
    title: APP_NAME,
    message: `${APP_NAME} v${version}`,
    detail: `Copyright © 2026\n${APP_HOMEPAGE_URL}`,
    buttons: ['项目主页', '关闭'],
    defaultId: 1,
    cancelId: 1,
  }
  const showDialog = win && !win.isDestroyed()
    ? dialog.showMessageBox(win, options)
    : dialog.showMessageBox(options)
  void showDialog
    .then(({ response }) => {
      if (response === 0) openHomepage()
    })
    .catch(error => {
      console.error('[Menu] Failed to show About dialog:', error)
    })
}

function applyMenu(columns: number | 'auto'): void {
  const version = app.getVersion()
  const template = buildMenuTemplate({
    platform: process.platform,
    version,
    appName: APP_NAME,
    columns,
    onCommand: sendCommand,
    onAbout: showAbout,
    onCheckUpdates: () => startUpdateFlow(getMainWindowFn),
    onHomepage: openHomepage,
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * Route an in-app toolbar menu action (Linux/Windows). The native menu bar is
 * not rendered there (titleBarStyle: 'hidden'), so the renderer re-issues the
 * same handlers through IPC.APP_MENU_ACTION.
 */
export function handleAppMenuAction(action: unknown): void {
  switch (action) {
    case 'check-updates':
      startUpdateFlow(getMainWindowFn)
      break
    case 'about':
      showAbout()
      break
    case 'homepage':
      openHomepage()
      break
    case 'quit':
      app.quit()
      break
    default:
      console.warn(`[Menu] Ignoring unknown app menu action: ${String(action)}`)
  }
}

/** Build and set the application menu. Call after config is loaded. */
export function buildAndSetMenu(getMainWindow: () => BrowserWindow | null): void {
  getMainWindowFn = getMainWindow
  applyMenu(configStore.get().columns)
}

/** Rebuild menu with updated column checked state. */
export function syncColumnsMenu(columns: number | 'auto'): void {
  applyMenu(columns)
}
