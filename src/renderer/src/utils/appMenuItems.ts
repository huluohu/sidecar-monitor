// Entries of the in-app toolbar menu shown on Linux/Windows, where the native
// menu bar is not rendered (titleBarStyle: 'hidden'). Mirrors the native menu
// so every capability stays reachable; set-column layout lives in the toolbar
// select and refresh/fullscreen have dedicated buttons, so they are not repeated.
export type AppMenuActionId =
  | 'settings'
  | 'import-config'
  | 'export-config'
  | 'check-updates'
  | 'homepage'
  | 'about'
  | 'quit'

export type AppMenuItem =
  | { kind: 'separator' }
  | { kind: 'item'; id: AppMenuActionId; label: string; shortcut?: string }

export const APP_MENU_ITEMS: AppMenuItem[] = [
  { kind: 'item', id: 'settings', label: '设置', shortcut: 'Ctrl+,' },
  { kind: 'separator' },
  { kind: 'item', id: 'import-config', label: '导入配置', shortcut: 'Ctrl+Shift+I' },
  { kind: 'item', id: 'export-config', label: '导出配置', shortcut: 'Ctrl+Shift+E' },
  { kind: 'separator' },
  { kind: 'item', id: 'check-updates', label: '检查更新…' },
  { kind: 'item', id: 'homepage', label: '项目主页' },
  { kind: 'item', id: 'about', label: '关于 Sidecar Monitor' },
  { kind: 'separator' },
  { kind: 'item', id: 'quit', label: '退出' },
]
