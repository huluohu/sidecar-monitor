import { describe, it, expect, vi } from 'vitest'
import { buildMenuTemplate } from '../src/main/appMenu'
import type { MenuTemplateOpts } from '../src/main/appMenu'
import type { MenuCommand } from '../src/shared/types'
import type { MenuItemConstructorOptions } from 'electron'

vi.mock('electron', () => ({
  app: {
    getName: () => 'Sidecar Monitor',
    getVersion: () => '0.1.3',
    getPath: () => '/mock-user-data',
    setAboutPanelOptions: vi.fn(),
    showAboutPanel: vi.fn(),
  },
  Menu: {
    buildFromTemplate: vi.fn(t => t),
    setApplicationMenu: vi.fn(),
    getApplicationMenu: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
  dialog: { showMessageBox: vi.fn(), showErrorBox: vi.fn() },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

const baseOpts: MenuTemplateOpts = {
  platform: 'linux',
  version: '0.1.3',
  appName: 'Sidecar Monitor',
  columns: 'auto',
  onCommand: vi.fn(),
  onAbout: vi.fn(),
  onHomepage: vi.fn(),
}

function findSubmenu(
  template: MenuItemConstructorOptions[],
  menuLabel: string,
): MenuItemConstructorOptions[] {
  const menu = template.find(i => i.label === menuLabel)
  expect(menu?.submenu, `${menuLabel} submenu`).toBeDefined()
  return menu!.submenu as MenuItemConstructorOptions[]
}

describe('buildMenuTemplate — platform structure', () => {
  it('macOS: first item is app menu with Settings; File has no Settings or Quit', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'darwin' })
    const appMenu = template[0]
    expect(appMenu.label).toBe('Sidecar Monitor')
    const appSubmenu = appMenu.submenu as MenuItemConstructorOptions[]
    expect(appSubmenu.some(i => i.label === 'Settings')).toBe(true)
    const fileItems = findSubmenu(template, 'File')
    expect(fileItems.some(i => i.label === 'Settings')).toBe(false)
    expect(fileItems.some(i => i.role === 'quit')).toBe(false)
  })

  it('Windows/Linux: File menu contains Settings and Quit; no app-menu prefix', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'win32' })
    expect(template[0].label).toBe('File')
    const fileItems = findSubmenu(template, 'File')
    expect(fileItems.some(i => i.label === 'Settings')).toBe(true)
    expect(fileItems.some(i => i.role === 'quit')).toBe(true)
  })

  it('Linux: About with version in Help menu', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'linux', version: '1.2.3' })
    const helpItems = findSubmenu(template, 'Help')
    expect(helpItems.some(i => i.label?.includes('1.2.3'))).toBe(true)
  })

  it('macOS: About not in Help menu', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'darwin', version: '0.1.3' })
    const helpItems = findSubmenu(template, 'Help')
    expect(helpItems.some(i => i.label?.includes('0.1.3'))).toBe(false)
  })

  it('macOS: Window menu has zoom and front roles', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'darwin' })
    const roles = (findSubmenu(template, 'Window')).map(i => i.role)
    expect(roles).toContain('zoom')
    expect(roles).toContain('front')
  })

  it('Windows: Window menu has only minimize', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'win32' })
    const windowItems = findSubmenu(template, 'Window')
    expect(windowItems).toHaveLength(1)
    expect(windowItems[0].role).toBe('minimize')
  })
})

describe('buildMenuTemplate — version label', () => {
  it('v0.1.3 in macOS app menu About label including app name', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'darwin', version: '0.1.3' })
    const appSubmenu = template[0].submenu as MenuItemConstructorOptions[]
    const about = appSubmenu.find(i => i.label?.includes('v0.1.3'))
    expect(about).toBeDefined()
    expect(about!.label).toContain('Sidecar Monitor')
  })

  it('v2.5.0 in Linux Help menu About label', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'linux', version: '2.5.0' })
    const helpItems = findSubmenu(template, 'Help')
    expect(helpItems.some(i => i.label?.includes('v2.5.0'))).toBe(true)
  })
})

describe('buildMenuTemplate — Edit roles', () => {
  it('Edit menu has undo, redo, cut, copy, paste, selectAll', () => {
    const template = buildMenuTemplate(baseOpts)
    const roles = findSubmenu(template, 'Edit').map(i => i.role).filter(Boolean)
    for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']) {
      expect(roles).toContain(role)
    }
  })
})

describe('buildMenuTemplate — Layout columns', () => {
  it('Layout menu has 21 radio items (auto + 1–20)', () => {
    const items = findSubmenu(buildMenuTemplate(baseOpts), 'Layout')
    expect(items).toHaveLength(21)
    expect(items.every(i => i.type === 'radio')).toBe(true)
  })

  it('auto checked when columns is auto', () => {
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, columns: 'auto' }), 'Layout')
    const checked = items.filter(i => i.checked)
    expect(checked).toHaveLength(1)
    expect(checked[0].id).toBe('layout-auto')
  })

  it('column 5 checked when columns is 5', () => {
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, columns: 5 }), 'Layout')
    expect(items.filter(i => i.checked)[0].id).toBe('layout-5')
  })

  it('column 20 checked when columns is 20', () => {
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, columns: 20 }), 'Layout')
    expect(items.filter(i => i.checked)[0].id).toBe('layout-20')
  })

  it('set-columns command emitted with numeric value on click', () => {
    const onCommand = vi.fn<[MenuCommand], void>()
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, onCommand }), 'Layout')
    const item3 = items.find(i => i.id === 'layout-3')!
    item3.click!(item3 as never, {} as never, {} as never)
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-columns', columns: 3 })
  })

  it('set-columns auto emitted for Auto item', () => {
    const onCommand = vi.fn<[MenuCommand], void>()
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, columns: 3, onCommand }), 'Layout')
    const autoItem = items.find(i => i.id === 'layout-auto')!
    autoItem.click!(autoItem as never, {} as never, {} as never)
    expect(onCommand).toHaveBeenCalledWith({ type: 'set-columns', columns: 'auto' })
  })
})

describe('buildMenuTemplate — View accelerators', () => {
  it('Refresh All has CmdOrCtrl+R', () => {
    const items = findSubmenu(buildMenuTemplate(baseOpts), 'View')
    expect(items.find(i => i.label === 'Refresh All')?.accelerator).toBe('CmdOrCtrl+R')
  })

  it('Toggle Full Screen uses Ctrl+Cmd+F on macOS', () => {
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, platform: 'darwin' }), 'View')
    expect(items.find(i => i.label === 'Toggle Full Screen')?.accelerator).toBe('Ctrl+Cmd+F')
  })

  it('Toggle Full Screen uses F11 on Windows', () => {
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, platform: 'win32' }), 'View')
    expect(items.find(i => i.label === 'Toggle Full Screen')?.accelerator).toBe('F11')
  })

  it('Toggle Full Screen uses F11 on Linux', () => {
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, platform: 'linux' }), 'View')
    expect(items.find(i => i.label === 'Toggle Full Screen')?.accelerator).toBe('F11')
  })
})

describe('buildMenuTemplate — Settings accelerator', () => {
  it('CmdOrCtrl+, on macOS app menu Settings', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'darwin' })
    const appSubmenu = template[0].submenu as MenuItemConstructorOptions[]
    expect(appSubmenu.find(i => i.label === 'Settings')?.accelerator).toBe('CmdOrCtrl+,')
  })

  it('CmdOrCtrl+, on Windows File menu Settings', () => {
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, platform: 'win32' }), 'File')
    expect(items.find(i => i.label === 'Settings')?.accelerator).toBe('CmdOrCtrl+,')
  })
})

describe('buildMenuTemplate — actionable item IDs', () => {
  it('macOS app menu About has id "about"', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'darwin' })
    const appSubmenu = template[0].submenu as MenuItemConstructorOptions[]
    const about = appSubmenu.find(i => i.label?.includes('About'))!
    expect(about.id).toBe('about')
  })

  it('macOS app menu Settings has id "settings"', () => {
    const template = buildMenuTemplate({ ...baseOpts, platform: 'darwin' })
    const appSubmenu = template[0].submenu as MenuItemConstructorOptions[]
    expect(appSubmenu.find(i => i.label === 'Settings')?.id).toBe('settings')
  })

  it('Win/Linux File menu Settings has id "settings"', () => {
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, platform: 'win32' }), 'File')
    expect(items.find(i => i.label === 'Settings')?.id).toBe('settings')
  })

  it('Import Config has id "import-config"', () => {
    const items = findSubmenu(buildMenuTemplate(baseOpts), 'File')
    expect(items.find(i => i.label === 'Import Config')?.id).toBe('import-config')
  })

  it('Export Config has id "export-config"', () => {
    const items = findSubmenu(buildMenuTemplate(baseOpts), 'File')
    expect(items.find(i => i.label === 'Export Config')?.id).toBe('export-config')
  })

  it('Refresh All has id "refresh-all"', () => {
    const items = findSubmenu(buildMenuTemplate(baseOpts), 'View')
    expect(items.find(i => i.label === 'Refresh All')?.id).toBe('refresh-all')
  })

  it('Toggle Full Screen has id "toggle-fullscreen"', () => {
    const items = findSubmenu(buildMenuTemplate(baseOpts), 'View')
    expect(items.find(i => i.label === 'Toggle Full Screen')?.id).toBe('toggle-fullscreen')
  })

  it('Project Homepage has id "homepage"', () => {
    const items = findSubmenu(buildMenuTemplate(baseOpts), 'Help')
    expect(items.find(i => i.label === 'Project Homepage')?.id).toBe('homepage')
  })

  it('Win/Linux Help About has id "about"', () => {
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, platform: 'linux' }), 'Help')
    const about = items.find(i => i.label?.includes('About'))!
    expect(about.id).toBe('about')
  })

  it('macOS Help menu has no About item', () => {
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, platform: 'darwin' }), 'Help')
    expect(items.every(i => !i.label?.includes('About'))).toBe(true)
  })
})

describe('buildMenuTemplate — command callbacks', () => {
  it('open-settings from Settings on Linux', () => {
    const onCommand = vi.fn<[MenuCommand], void>()
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, platform: 'linux', onCommand }), 'File')
    const s = items.find(i => i.label === 'Settings')!
    s.click!(s as never, {} as never, {} as never)
    expect(onCommand).toHaveBeenCalledWith({ type: 'open-settings' })
  })

  it('refresh-all from Refresh All', () => {
    const onCommand = vi.fn<[MenuCommand], void>()
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, onCommand }), 'View')
    const r = items.find(i => i.label === 'Refresh All')!
    r.click!(r as never, {} as never, {} as never)
    expect(onCommand).toHaveBeenCalledWith({ type: 'refresh-all' })
  })

  it('import-config from Import Config', () => {
    const onCommand = vi.fn<[MenuCommand], void>()
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, onCommand }), 'File')
    const im = items.find(i => i.label === 'Import Config')!
    im.click!(im as never, {} as never, {} as never)
    expect(onCommand).toHaveBeenCalledWith({ type: 'import-config' })
  })

  it('export-config from Export Config', () => {
    const onCommand = vi.fn<[MenuCommand], void>()
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, onCommand }), 'File')
    const ex = items.find(i => i.label === 'Export Config')!
    ex.click!(ex as never, {} as never, {} as never)
    expect(onCommand).toHaveBeenCalledWith({ type: 'export-config' })
  })

  it('toggle-fullscreen from Toggle Full Screen', () => {
    const onCommand = vi.fn<[MenuCommand], void>()
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, onCommand }), 'View')
    const fs = items.find(i => i.label === 'Toggle Full Screen')!
    fs.click!(fs as never, {} as never, {} as never)
    expect(onCommand).toHaveBeenCalledWith({ type: 'toggle-fullscreen' })
  })

  it('onAbout called from macOS app menu About', () => {
    const onAbout = vi.fn()
    const template = buildMenuTemplate({ ...baseOpts, platform: 'darwin', onAbout })
    const appSubmenu = template[0].submenu as MenuItemConstructorOptions[]
    const about = appSubmenu.find(i => i.label?.includes('About'))!
    about.click!(about as never, {} as never, {} as never)
    expect(onAbout).toHaveBeenCalled()
  })

  it('onHomepage called from Help > Project Homepage', () => {
    const onHomepage = vi.fn()
    const items = findSubmenu(buildMenuTemplate({ ...baseOpts, onHomepage }), 'Help')
    const hp = items.find(i => i.label === 'Project Homepage')!
    hp.click!(hp as never, {} as never, {} as never)
    expect(onHomepage).toHaveBeenCalled()
  })
})
