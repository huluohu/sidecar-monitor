/**
 * URL and navigation policy helpers — no Electron/DOM deps, testable.
 */

export function isHttpUrl(url: string): boolean {
  try {
    const p = new URL(url)
    return (
      (p.protocol === 'http:' || p.protocol === 'https:') &&
      p.hostname.length > 0 &&
      p.username === '' &&
      p.password === ''
    )
  } catch {
    return false
  }
}

export function isSameOrigin(urlA: string, urlB: string): boolean {
  try {
    return new URL(urlA).origin === new URL(urlB).origin
  } catch {
    return false
  }
}

/**
 * Extract the HTTP(S) origin from a URL.
 * Returns '' for non-http(s) or malformed URLs.
 */
export function getOrigin(url: string): string {
  try {
    const p = new URL(url)
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return ''
    return p.origin
  } catch {
    return ''
  }
}

/**
 * Classify a navigation destination relative to a site's configured URL.
 *
 * 'allow'    — same-origin, proceed normally
 * 'block'    — non-http(s) or otherwise disallowed
 * 'external' — http(s) but cross-origin: offer to shell.openExternal
 */
export type NavigationDecision = 'allow' | 'block' | 'external'

export function classifyNavigation(
  targetUrl: string,
  configuredUrl: string,
): NavigationDecision {
  if (!isHttpUrl(targetUrl)) return 'block'
  if (isSameOrigin(targetUrl, configuredUrl)) return 'allow'
  return 'external'
}

// ---------------------------------------------------------------------------
// Stateful redirect-chain policy — state machine
// ---------------------------------------------------------------------------

/**
 * Mutable per-WebContents navigation state for the stateful redirect-chain policy.
 *
 * `trustedOrigin` starts as the origin of the site's configured URL and is
 * updated each time a main-frame navigation commits. This allows same-origin
 * links and SPA routing to work after the initial load, including after
 * HTTP redirect chains that land on a different origin.
 */
export interface NavigationState {
  /** HTTP(S) origin of the currently trusted page. */
  trustedOrigin: string
  /** True while a server-initiated redirect chain is in-flight for the main frame. */
  pendingRedirect: boolean
}

/** Create the initial navigation state from a site's configured URL. */
export function createNavigationState(configuredUrl: string): NavigationState {
  return {
    trustedOrigin: getOrigin(configuredUrl),
    pendingRedirect: false,
  }
}

/**
 * Handle a `will-navigate` event (user/script-initiated navigation).
 *
 * - Clears `pendingRedirect` (a new renderer navigation supersedes any in-flight chain).
 * - Non-http(s) → 'block'.
 * - Main-frame same-origin to `state.trustedOrigin` → 'allow'.
 * - Main-frame cross-origin → 'block' (direct cross-origin navigation is never allowed).
 * - Subframe http(s) navigation → 'allow' (subframes may navigate freely within http(s)).
 *
 * Mutates `state.pendingRedirect`.
 */
export function onWillNavigate(
  state: NavigationState,
  url: string,
  isMainFrame: boolean,
): 'allow' | 'block' {
  state.pendingRedirect = false
  if (!isHttpUrl(url)) return 'block'
  if (isMainFrame) {
    return isSameOrigin(url, state.trustedOrigin) ? 'allow' : 'block'
  }
  return 'allow'
}

/**
 * Handle a `will-redirect` event (server-side 3xx redirect).
 *
 * - Non-http(s) target → 'block'.
 * - HTTP(S) target → 'allow' (cross-origin multi-hop redirect chains are permitted).
 * - Main-frame redirect: sets `pendingRedirect = true` to track the active chain.
 * - Subframe redirect: allowed but does not set `pendingRedirect`.
 *
 * Mutates `state.pendingRedirect`.
 */
export function onWillRedirect(
  state: NavigationState,
  url: string,
  isMainFrame: boolean,
): 'allow' | 'block' {
  if (!isHttpUrl(url)) return 'block'
  if (isMainFrame) {
    state.pendingRedirect = true
  }
  return 'allow'
}

/**
 * Result type for `onDidNavigate`.
 * - `'committed'` — http(s) page committed; `trustedOrigin` updated to final origin.
 * - `'blank'`     — `about:blank` committed; `trustedOrigin` unchanged.
 * - `'non-http'`  — unexpected scheme committed; caller should recover.
 */
export type DidNavigateResult = 'committed' | 'blank' | 'non-http'

/**
 * Handle a `did-navigate` event (main-frame navigation committed).
 *
 * - Always clears `pendingRedirect`.
 * - Updates `trustedOrigin` to the origin of the final landed URL for http(s) pages.
 * - This locks subsequent `will-navigate` checks to the committed origin, so back/reload
 *   and same-origin SPA routing continue to work after a redirect chain.
 *
 * Mutates `state.trustedOrigin` and `state.pendingRedirect`.
 */
export function onDidNavigate(state: NavigationState, url: string): DidNavigateResult {
  state.pendingRedirect = false
  if (isHttpUrl(url)) {
    state.trustedOrigin = getOrigin(url)
    return 'committed'
  }
  if (url === 'about:blank') return 'blank'
  return 'non-http'
}

/**
 * Handle a main-frame `did-fail-load` event.
 * Clears `pendingRedirect` so a stale redirect chain cannot affect subsequent navigations.
 */
export function onDidFailLoad(state: NavigationState): void {
  state.pendingRedirect = false
}
