import type { Session, WebContents } from 'electron'
import {
  createNavigationState,
  onWillNavigate,
  onWillRedirect,
  onDidNavigate,
  onDidFailLoad,
} from '@shared/urlPolicy'

const securedSessions = new WeakSet<Session>()

/**
 * Apply stateful navigation policy to a WebContentsView's webContents.
 *
 * Security model:
 * – Trusted origin starts as the origin of `configuredUrl`.
 * – Server-initiated HTTP(S) redirects (`will-redirect`): cross-origin multi-hop chains
 *   are allowed; non-http(s) redirect targets are blocked.
 * – Main-frame commit locks `trustedOrigin` to the final landed URL's origin,
 *   enabling same-origin navigation (SPA routing, back/reload) to keep working.
 * – Direct cross-origin main-frame navigation (`will-navigate`): always blocked.
 * – Same-origin main-frame navigation: allowed (login flows, internal routing).
 * – Subframe HTTP(S) redirects/navigation: allowed; never update `trustedOrigin`.
 * – Non-http(s) protocol (file/javascript/data/blob): blocked everywhere.
 * – New windows: always denied.
 *
 * Event ordering notes (Electron 43):
 * – `loadURL()` does not fire `will-navigate`; server redirects fire `will-redirect`.
 * – `will-navigate` fires only for renderer-initiated (user/script) navigations.
 * – `will-navigate` always resets `pendingRedirect` so a stale redirect chain state
 *   cannot accidentally authorise an unrelated direct navigation.
 * – `pendingRedirect` is also cleared on `did-navigate` (commit) and `did-fail-load`.
 */
export function applyNavigationPolicy(wc: WebContents, configuredUrl: string): void {
  const state = createNavigationState(configuredUrl)

  // Electron 43: first param is Event<WebContentsWillNavigateEventParams>, which
  // carries .url, .isMainFrame, and .preventDefault() (positional url arg is deprecated).
  wc.on('will-navigate', (details) => {
    if (onWillNavigate(state, details.url, details.isMainFrame) === 'block') {
      details.preventDefault()
    }
  })

  // will-redirect fires for server-side 3xx redirects; same Event<T> pattern.
  wc.on('will-redirect', (details) => {
    if (onWillRedirect(state, details.url, details.isMainFrame) === 'block') {
      details.preventDefault()
    }
  })

  // did-navigate fires only for main-frame commits (positional args; no details object).
  wc.on('did-navigate', (_event, url) => {
    const result = onDidNavigate(state, url)
    if (result === 'non-http') {
      console.error(
        `[navigationPolicy] Non-http(s) URL committed on main frame: ${url}. Recovering to configured URL.`,
      )
      wc.loadURL(configuredUrl).catch((err: unknown) => {
        const code =
          typeof err === 'object' && err && 'code' in err
            ? String((err as { code: unknown }).code)
            : 'UNKNOWN'
        console.error(`[navigationPolicy] Recovery loadURL failed: ${code}`)
      })
    }
  })

  // Clear pending redirect state on failed main-frame load.
  wc.on('did-fail-load', (_event, _errorCode, _errorDesc, _validatedURL, isMainFrame) => {
    if (isMainFrame) {
      onDidFailLoad(state)
    }
  })

  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
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
