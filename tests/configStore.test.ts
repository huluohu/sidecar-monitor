import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { AppConfig, SiteConfig } from '../src/shared/types'
import {
  createConfigSnapshot,
  reorderEnabledSites,
} from '../src/renderer/src/stores/configStore'

describe('createConfigSnapshot', () => {
  it('removes Vue proxies before sending a second site through IPC', () => {
    const config = reactive<AppConfig>({
      schemaVersion: 1,
      sites: [{
        id: 'site-one',
        name: 'Site one',
        url: 'https://one.example.com',
        enabled: true,
        order: 0,
        zoomFactor: 0.8,
      }],
      columns: 'auto',
      fullscreenOnLaunch: false,
    })

    config.sites.push({
      id: 'site-two',
      name: 'Site two',
      url: 'https://two.example.com',
      enabled: true,
      order: 1,
      zoomFactor: 0.8,
    })

    const snapshot = createConfigSnapshot(config)
    expect(() => structuredClone(snapshot)).not.toThrow()
    expect(snapshot.sites.map(site => site.id)).toEqual(['site-one', 'site-two'])
  })
})

describe('reorderEnabledSites', () => {
  const site = (id: string, order: number, enabled = true): SiteConfig => ({
    id,
    name: id,
    url: `https://${id}.example.com`,
    enabled,
    order,
    zoomFactor: 1,
  })

  it('moves an enabled site to the dropped site position', () => {
    const reordered = reorderEnabledSites(
      [site('a', 0), site('b', 1), site('c', 2)],
      'a',
      'c',
    )

    expect(reordered?.map(item => item.id)).toEqual(['b', 'c', 'a'])
    expect(reordered?.map(item => item.order)).toEqual([0, 1, 2])
  })

  it('keeps disabled sites in their relative slots', () => {
    const reordered = reorderEnabledSites(
      [site('a', 0), site('disabled', 1, false), site('b', 2), site('c', 3)],
      'c',
      'a',
    )

    expect(reordered?.map(item => item.id)).toEqual(['c', 'disabled', 'a', 'b'])
  })

  it('ignores invalid and no-op drops', () => {
    const sites = [site('a', 0), site('b', 1)]
    expect(reorderEnabledSites(sites, 'a', 'a')).toBeNull()
    expect(reorderEnabledSites(sites, 'missing', 'b')).toBeNull()
  })
})
