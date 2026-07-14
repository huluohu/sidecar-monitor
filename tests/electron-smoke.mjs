import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const userDataDir = mkdtempSync(join(tmpdir(), 'sidecar-monitor-smoke-'))

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end('<!doctype html><title>Test site</title><main>ready</main>')
})

let electronApp
try {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not expose a port')

  electronApp = await electron.launch({
    executablePath: electronPath,
    args: [projectDir],
    env: {
      ...process.env,
      SIDECAR_MONITOR_USER_DATA: userDataDir,
      SIDECAR_MONITOR_DISABLE_LEGACY_MIGRATION: '1',
    },
  })

  const page = await electronApp.firstWindow()
  await page.locator('button[title="设置"]').click()

  for (let index = 1; index <= 5; index++) {
    await page.getByRole('button', { name: '+ 添加' }).click()
    const modal = page.locator('.modal')
    await modal.locator('input[type="text"]').fill(`Site ${index}`)
    await modal.locator('input[type="url"]').fill(
      `http://127.0.0.1:${address.port}/site-${index}`,
    )
    await modal.getByRole('button', { name: '保存' }).click()
    try {
      await modal.waitFor({ state: 'detached', timeout: 3_000 })
    } catch (error) {
      const [modalText, config] = await Promise.all([
        modal.textContent(),
        page.evaluate(() => window.monitorAPI.getConfig()),
      ])
      throw new Error(
        `Save ${index} did not close. Modal: ${modalText}; persisted sites: ${config.sites.length}`,
        { cause: error },
      )
    }

    const rowCount = await page.locator('.site-row').count()
    if (rowCount !== index) {
      throw new Error(`Expected ${index} site rows after save, received ${rowCount}`)
    }
  }

  const savedCount = await page.evaluate(() => window.monitorAPI.getConfig().then(c => c.sites.length))
  if (savedCount !== 5) throw new Error(`Expected 5 persisted sites, received ${savedCount}`)

  await page.locator('.drawer-header button[title="关闭"]').click()
  await page.waitForFunction(
    () => window.monitorAPI.getSiteStates().then(states => states.length === 5),
    undefined,
    { timeout: 10_000 },
  )

  const metrics = await page.evaluate(() => window.monitorAPI.getMetrics())
  if (metrics.siteCount !== 5) {
    throw new Error(`Expected 5 live site views, received ${metrics.siteCount}`)
  }

  console.log('Electron smoke passed: 5 consecutive sites saved and reconciled')
} finally {
  if (electronApp) await electronApp.close()
  await new Promise(resolveClose => server.close(resolveClose))
  rmSync(userDataDir, { recursive: true, force: true })
}
