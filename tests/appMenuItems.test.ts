import { describe, it, expect } from 'vitest'
import { APP_MENU_ITEMS } from '../src/renderer/src/utils/appMenuItems'

const itemIds = APP_MENU_ITEMS
  .filter((item): item is Extract<typeof item, { kind: 'item' }> => item.kind === 'item')
  .map(item => item.id)

describe('APP_MENU_ITEMS', () => {
  it('covers the capabilities that have no other UI entry on Linux/Windows', () => {
    // Settings/refresh/layout/import/export are reachable elsewhere, but
    // check-updates, homepage, about and quit live ONLY in this menu.
    expect(itemIds).toContain('settings')
    expect(itemIds).toContain('import-config')
    expect(itemIds).toContain('export-config')
    expect(itemIds).toContain('check-updates')
    expect(itemIds).toContain('homepage')
    expect(itemIds).toContain('about')
    expect(itemIds).toContain('quit')
  })

  it('has unique item ids', () => {
    expect(new Set(itemIds).size).toBe(itemIds.length)
  })

  it('gives every item a non-empty label', () => {
    for (const item of APP_MENU_ITEMS) {
      if (item.kind === 'item') {
        expect(item.label.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('declares shortcuts only for items that mirror native-menu accelerators', () => {
    const withShortcut = APP_MENU_ITEMS
      .filter((item): item is Extract<typeof item, { kind: 'item' }> => item.kind === 'item')
      .filter(item => item.shortcut !== undefined)
      .map(item => item.id)
    expect(withShortcut).toEqual(['settings', 'import-config', 'export-config'])
  })
})
