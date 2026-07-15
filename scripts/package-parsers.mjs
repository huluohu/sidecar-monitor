/**
 * Parse a macOS property list XML string and return the string value for the
 * given key, or null if the key is absent.
 */
export function parsePlistKey(xml, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `<key>${escapedKey}<\\/key>\\s*<string>([^<]+)<\\/string>`,
  )
  const match = xml.match(pattern)
  return match ? match[1].trim() : null
}

/**
 * Parse a FreeDesktop entry and return the first value for each key.
 */
export function parseDesktopEntry(text) {
  /** @type {Record<string, string>} */
  const result = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('[')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (!(key in result)) result[key] = value
  }
  return result
}
