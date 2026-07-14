/**
 * Serial reconcile queue with "latest config wins" semantics.
 *
 * - Only one reconcile executes at a time.
 * - If a new config arrives while a reconcile is in progress, it is stored as
 *   pending and executed immediately after the current run finishes.
 * - Consecutive pending submissions collapse into the single most-recent one.
 * - No Electron / DOM dependencies — fully unit-testable via dependency injection.
 */
export class ReconcileQueue<T> {
  private running = false
  private scheduled = false
  private pending: T | null = null

  constructor(
    /** The async operation to perform for a given config. */
    private readonly executor: (config: T) => Promise<void>,
    private readonly defer: (callback: () => void) => void = setImmediate,
  ) {}

  /**
   * Schedule a reconcile for `config`.
   * If one is already running, the config is stored as pending (replacing any
   * earlier pending) and will run when the current completes.
   */
  schedule(config: T): void {
    this.pending = config
    this.scheduleDrain()
  }

  /** True when a reconcile is currently executing. */
  get isRunning(): boolean {
    return this.running
  }

  /** True when a reconcile is pending after the current run. */
  get hasPending(): boolean {
    return this.pending !== null
  }

  private scheduleDrain(): void {
    if (this.running || this.scheduled || this.pending === null) return
    this.scheduled = true
    this.defer(() => {
      this.scheduled = false
      this.drain()
    })
  }

  private drain(): void {
    if (this.pending === null) return
    const cfg = this.pending
    this.pending = null
    this.running = true
    this.executor(cfg)
      .catch((err: unknown) => {
        console.error('[ReconcileQueue] executor error:', err)
      })
      .finally(() => {
        this.running = false
        this.scheduleDrain()
      })
  }
}
