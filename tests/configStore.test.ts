import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { AppConfig } from '../src/shared/types'
import { createConfigSnapshot } from '../src/renderer/src/stores/configStore'

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
