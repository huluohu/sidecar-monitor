const SITE_APP_PRODUCT_PATTERN =
  /(?:^|\s)(?:electron|sidecar-monitor|sidecarmonitor)\/[^\s]+/gi

/**
 * Present monitored sites as regular Chromium pages rather than Electron apps.
 * Some sites enable native-client integrations when they see Electron in the
 * user agent, even though those native bridges do not exist in a WebContentsView.
 */
export function toSiteUserAgent(userAgent: string): string {
  const filtered = userAgent.replace(SITE_APP_PRODUCT_PATTERN, '')
  return filtered === userAgent ? userAgent : filtered.trim().replace(/\s+/g, ' ')
}
