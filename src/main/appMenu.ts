import { app, Menu, shell, dialog } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { IPC } from '@shared/types'
import type { MenuCommand } from '@shared/types'
import { configStore } from './configStore'

// ── Pure template builder (testable without Electron) ─────────────────────────

export interface MenuTemplateOpts {
  platform: NodeJS.Platform
  version: string
  appName: string
  columns: number | 'auto'
  onCommand: (cmd: MenuCommand) => void
  onAbout: () => void
  onHomepage: () => void
}

const COLUMN_VALUES: Array<number | 'auto'> = [
  'auto', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
]

export function buildMenuTemplate(opts: MenuTemplateOpts): MenuItemConstructorOptions[] {
  const { platform, version, appName, columns, onCommand, onAbout, onHomepage } = opts
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

let getMainWindowFn: () => BrowserWindow | null = () => null

function sendCommand(cmd: MenuCommand): void {
  getMainWindowFn()?.webContents.send(IPC.MENU_COMMAND, cmd)
}

function showAbout(): void {
  const version = app.getVersion()
  if (process.platform === 'darwin') {
    app.showAboutPanel()
  } else {
    const options: Electron.MessageBoxOptions = {
      type: 'info',
      title: 'About Sidecar Monitor',
      message: `Sidecar Monitor v${version}`,
      detail: `Copyright © 2026\nhttps://github.com/huluohu/sidecar-monitor`,
    }
    const win = getMainWindowFn()
    const showDialog = win && !win.isDestroyed()
      ? dialog.showMessageBox(win, options)
      : dialog.showMessageBox(options)
    void showDialog.catch(error => {
      console.error('[Menu] Failed to show About dialog:', error)
    })
  }
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
    onHomepage: () => {
      void shell.openExternal('https://github.com/huluohu/sidecar-monitor').catch(error => {
        console.error('[Menu] Failed to open project homepage:', error)
      })
    },
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Configure macOS About panel (call once after app is ready). */
export function configureAboutPanel(iconPath?: string): void {
  if (process.platform !== 'darwin') return
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © 2026',
    website: 'https://github.com/huluohu/sidecar-monitor',
    ...(iconPath ? { iconPath } : {}),
  })
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
