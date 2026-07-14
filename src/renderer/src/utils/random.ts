/** Simple UUID-like random ID for renderer-side use. */
export function randomId(): string {
  return crypto.randomUUID()
}
