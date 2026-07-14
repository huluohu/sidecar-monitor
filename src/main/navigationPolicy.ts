import type { Session, WebContents } from 'electron'
import { classifyNavigation } from '@shared/urlPolicy'

const securedSessions = new WeakSet<Session>()

/**
 * Apply navigation policy to a WebContentsView's webContents.
 * - Same-origin navigations: allowed (login flows, internal routing).
 * - Cross-origin http(s): blocked. Remote content cannot open system windows.
 * - Non-http(s): blocked unconditionally.
 * - New windows: always denied; http(s) cross-origin offered to shell.openExternal.
 */
export function applyNavigationPolicy(wc: WebContents, configuredUrl: string): void {
  wc.on('will-navigate', (event, url) => {
    const decision = classifyNavigation(url, configuredUrl)
    if (decision === 'allow') return
    event.preventDefault()
  })

  wc.on('will-redirect', (event, url) => {
    if (classifyNavigation(url, configuredUrl) !== 'allow') {
      event.preventDefault()
    }
  })

  wc.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  // After navigation lands, guard against non-http pages (e.g. redirected to blob:)
  wc.on('did-navigate', (_event, url) => {
    if (!url.startsWith('http://') && !url.startsWith('https://') && url !== 'about:blank') {
      wc.loadURL(configuredUrl).catch(() => undefined)
    }
  })
}

/**
 * Apply session-level security and retain Chromium's default TLS verification.
 */
export function applySessionPolicy(wc: WebContents): void {
  const sess = wc.session
  if (securedSessions.has(sess)) return
  securedSessions.add(sess)

  sess.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })
  sess.setPermissionCheckHandler(() => false)
  sess.on('will-download', event => {
    event.preventDefault()
  })
}
