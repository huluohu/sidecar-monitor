/**
 * FIFO initial-load scheduler with configurable max concurrency.
 *
 * A slot is released exactly once when the task promise settles.
 * Queued tasks can be cancelled by site id or token; running tasks
 * must be stopped externally (e.g. wc.stop()), which causes the
 * promise to settle and releases the slot automatically via `finally`.
 */

export type LoadToken = symbol

interface QueueEntry {
  id: string
  token: LoadToken
  fn: () => Promise<void>
}

export class LoadScheduler {
  private _running = 0
  private readonly _maxConcurrency: number
  private _queue: QueueEntry[] = []

  constructor(maxConcurrency = 2) {
    this._maxConcurrency = maxConcurrency
  }

  get runningCount(): number {
    return this._running
  }

  get queueLength(): number {
    return this._queue.length
  }

  /**
   * Schedule a load task for the given site id.
   * If a concurrency slot is free the task starts immediately,
   * otherwise it is appended to the FIFO queue.
   * Returns a token that can cancel a specific queued entry.
   */
  schedule(id: string, fn: () => Promise<void>): LoadToken {
    const token: LoadToken = Symbol(id)
    if (this._running < this._maxConcurrency) {
      this._launch(fn)
    } else {
      this._queue.push({ id, token, fn })
    }
    return token
  }

  /** Remove all queued (not yet running) entries for the given site id. */
  cancelById(id: string): void {
    this._queue = this._queue.filter(e => e.id !== id)
  }

  /** Remove the specific queued entry identified by token. */
  cancelByToken(token: LoadToken): void {
    this._queue = this._queue.filter(e => e.token !== token)
  }

  private _launch(fn: () => Promise<void>): void {
    this._running++
    fn().finally(() => {
      this._running--
      this._drain()
    // Task errors are the caller's responsibility; the scheduler only
    // releases the slot. Suppress to prevent unhandled-rejection warnings.
    }).catch(() => undefined)
  }

  private _drain(): void {
    while (this._running < this._maxConcurrency && this._queue.length > 0) {
      const entry = this._queue.shift()!
      this._launch(entry.fn)
    }
  }
}

export const loadScheduler = new LoadScheduler()
