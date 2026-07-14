import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseConfig, DEFAULT_CONFIG, isHttpUrl, validateSite } from '@shared/configSchema'
import type { AppConfig, SiteConfig } from '@shared/types'

class ConfigStore {
  private config: AppConfig = { ...DEFAULT_CONFIG, sites: [] }
  private configPath!: string
  private tmpPath!: string

  private init(): void {
    if (this.configPath) return
    const userData = app.getPath('userData')
    mkdirSync(userData, { recursive: true })
    this.configPath = join(userData, 'config.json')
    this.tmpPath = join(userData, '.config.json.tmp')
  }

  load(): void {
    this.init()
    this.config = { ...DEFAULT_CONFIG, sites: [] }
    if (!existsSync(this.configPath)) {
      return
    }
    const raw = JSON.parse(readFileSync(this.configPath, 'utf-8')) as unknown
    this.config = parseConfig(raw)
  }

  get(): AppConfig {
    return this.config
  }

  /** Atomic write: write to temp file then rename. */
  save(newConfig: AppConfig): void {
    this.init()
    const validated = parseConfig(newConfig)
    writeFileSync(this.tmpPath, JSON.stringify(validated, null, 2), 'utf-8')
    renameSync(this.tmpPath, this.configPath)
    this.config = validated
  }

  /** Import external config, assigning fresh IDs to avoid conflicts. */
  importFrom(raw: unknown): AppConfig {
    const imported = parseConfig(raw)
    imported.sites = imported.sites.map(s => ({ ...s, id: randomUUID() }))
    return imported
  }

  /** Export the current config (no cookies or credentials are stored). */
  export(): AppConfig {
    return JSON.parse(JSON.stringify(this.config)) as AppConfig
  }

  createSite(partial: {
    name: string
    url: string
    zoomFactor: number
    enabled: boolean
  }): SiteConfig {
    if (!isHttpUrl(partial.url)) throw new Error(`Invalid URL: ${partial.url}`)
    const site: SiteConfig = {
      id: randomUUID(),
      order: this.config.sites.length,
      ...partial,
    }
    if (!validateSite(site)) throw new Error('Invalid site config')
    return site
  }
}

export const configStore = new ConfigStore()
