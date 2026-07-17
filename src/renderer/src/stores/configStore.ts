import { ref, computed, toRaw } from 'vue'
import { defineStore } from 'pinia'
import type { AppConfig, SiteConfig } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/configSchema'
import { randomId } from '../utils/random'

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>({ ...DEFAULT_CONFIG, sites: [] })
  const loading = ref(true)

  async function load(): Promise<void> {
    try {
      const c = await window.monitorAPI.getConfig()
      config.value = c
    } finally {
      loading.value = false
    }
  }

  async function save(newConfig: AppConfig): Promise<void> {
    const snapshot = createConfigSnapshot(newConfig)
    await window.monitorAPI.saveConfig(snapshot)
    // Update local state immediately — no need to wait for CONFIG_CHANGED
    config.value = snapshot
  }

  /** Add or update a site. */
  async function upsertSite(site: Omit<SiteConfig, 'id'> & { id?: string }): Promise<void> {
    const sites = config.value.sites.map(existing => ({ ...toRaw(existing) }))
    const id = site.id ?? randomId()
    const existing = sites.findIndex(s => s.id === id)
    const finalSite: SiteConfig = { ...site, id, order: site.order ?? sites.length }
    if (existing !== -1) {
      sites[existing] = finalSite
    } else {
      sites.push(finalSite)
    }
    await save({ ...config.value, sites })
  }

  async function removeSite(id: string): Promise<void> {
    const sites = config.value.sites
      .filter(s => s.id !== id)
      .map((s, i) => ({ ...s, order: i }))
    await save({ ...config.value, sites })
  }

  async function moveSite(id: string, direction: 'up' | 'down'): Promise<void> {
    await window.monitorAPI.moveSite(id, direction)
    // Config will be pushed back via onConfigChanged (main-initiated change)
  }

  async function reorderSites(sourceId: string, targetId: string): Promise<void> {
    const sites = reorderEnabledSites(config.value.sites, sourceId, targetId)
    if (!sites) return
    await save({ ...config.value, sites })
  }

  async function setColumns(columns: number | 'auto'): Promise<void> {
    await save({ ...config.value, columns })
  }

  async function setFullscreenOnLaunch(v: boolean): Promise<void> {
    await save({ ...config.value, fullscreenOnLaunch: v })
  }

  /** Apply a config pushed from main (e.g. from zoom or move operations). */
  function applyExternalUpdate(c: AppConfig): void {
    config.value = c
  }

  const enabledSites = computed(() =>
    [...config.value.sites]
      .filter(s => s.enabled)
      .sort((a, b) => a.order - b.order),
  )

  return {
    config,
    loading,
    enabledSites,
    load,
    save,
    upsertSite,
    removeSite,
    moveSite,
    reorderSites,
    setColumns,
    setFullscreenOnLaunch,
    applyExternalUpdate,
  }
})

export function reorderEnabledSites(
  sites: SiteConfig[],
  sourceId: string,
  targetId: string,
): SiteConfig[] | null {
  if (sourceId === targetId) return null

  const ordered = [...sites].sort((a, b) => a.order - b.order)
  const enabled = ordered.filter(site => site.enabled)
  const sourceIndex = enabled.findIndex(site => site.id === sourceId)
  const targetIndex = enabled.findIndex(site => site.id === targetId)
  if (sourceIndex === -1 || targetIndex === -1) return null

  const [moved] = enabled.splice(sourceIndex, 1)
  enabled.splice(targetIndex, 0, moved)

  let enabledIndex = 0
  return ordered.map((site, order) => ({
    ...(site.enabled ? enabled[enabledIndex++] : site),
    order,
  }))
}

export function createConfigSnapshot(config: AppConfig): AppConfig {
  return {
    schemaVersion: config.schemaVersion,
    sites: config.sites.map(site => ({ ...toRaw(site) })),
    columns: config.columns,
    fullscreenOnLaunch: config.fullscreenOnLaunch,
  }
}
