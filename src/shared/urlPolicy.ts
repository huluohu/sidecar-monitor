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
 * Classify a navigation destination relative to a site's configured URL.
 *
 * 'allow'  — same-origin, proceed normally
 * 'block'  — non-http(s) or otherwise disallowed
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
