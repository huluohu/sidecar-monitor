/**
 * Wraps a promise with a timeout.
 * Rejects with `msg` if the promise does not settle within `ms` milliseconds.
 * The timeout does NOT cancel the underlying promise.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err: unknown) => { clearTimeout(timer); reject(err) },
    )
  })
}
