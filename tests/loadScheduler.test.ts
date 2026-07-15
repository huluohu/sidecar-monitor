/**
 * Unit tests for LoadScheduler.
 * Pure TypeScript — no Electron dependencies required.
 */
import { describe, it, expect } from 'vitest'
import { LoadScheduler } from '../src/main/loadScheduler'

// Helper: a promise that never settles (simulates an in-progress load).
const pending = (): Promise<void> => new Promise(() => {})

// Flush pending microtasks so finally() callbacks run.
const flushMicrotasks = (): Promise<void> =>
  new Promise(r => setTimeout(r, 0))

describe('LoadScheduler – max concurrency 2', () => {
  it('starts up to maxConcurrency tasks immediately without queuing', () => {
    const s = new LoadScheduler(2)
    let started = 0

    s.schedule('a', () => { started++; return pending() })
    s.schedule('b', () => { started++; return pending() })

    expect(started).toBe(2)
    expect(s.runningCount).toBe(2)
    expect(s.queueLength).toBe(0)
  })

  it('queues third task when two slots are occupied', () => {
    const s = new LoadScheduler(2)
    let started = 0

    s.schedule('a', () => { started++; return pending() })
    s.schedule('b', () => { started++; return pending() })
    s.schedule('c', () => { started++; return pending() })

    expect(started).toBe(2)
    expect(s.runningCount).toBe(2)
    expect(s.queueLength).toBe(1)
  })

  it('reflects correct counts with single-concurrency scheduler', () => {
    const s = new LoadScheduler(1)

    s.schedule('a', () => pending())
    s.schedule('b', () => pending())
    s.schedule('c', () => pending())

    expect(s.runningCount).toBe(1)
    expect(s.queueLength).toBe(2)
  })
})

describe('LoadScheduler – FIFO ordering', () => {
  it('dequeues entries in submission order after slot opens', async () => {
    const s = new LoadScheduler(1)
    const order: string[] = []
    let resolveFirst!: () => void
    const first = new Promise<void>(r => { resolveFirst = r })

    s.schedule('first', () => first)
    s.schedule('second', async () => { order.push('second') })
    s.schedule('third', async () => { order.push('third') })

    resolveFirst()
    await first
    await flushMicrotasks()

    expect(order[0]).toBe('second')
    await flushMicrotasks()
    expect(order[1]).toBe('third')
  })
})

describe('LoadScheduler – slot release on task completion', () => {
  it('releases slot after task resolves and starts next queued task', async () => {
    const s = new LoadScheduler(1)
    let resolve1!: () => void
    const p1 = new Promise<void>(r => { resolve1 = r })
    let started2 = false

    s.schedule('a', () => p1)
    s.schedule('b', async () => { started2 = true })

    expect(started2).toBe(false)
    resolve1()
    await p1
    await flushMicrotasks()

    expect(started2).toBe(true)
    expect(s.queueLength).toBe(0)
  })

  it('releases slot after task rejects (unhandled rejection swallowed by scheduler)', async () => {
    const s = new LoadScheduler(1)
    let started2 = false

    s.schedule('a', () => Promise.reject(new Error('expected-load-failure')))
    s.schedule('b', async () => { started2 = true })

    await flushMicrotasks()

    expect(started2).toBe(true)
    expect(s.runningCount).toBeLessThanOrEqual(1)
  })

  it('decrements runningCount after task settles', async () => {
    const s = new LoadScheduler(2)
    let resolve1!: () => void
    const p1 = new Promise<void>(r => { resolve1 = r })

    s.schedule('a', () => p1)
    expect(s.runningCount).toBe(1)

    resolve1()
    await flushMicrotasks()

    expect(s.runningCount).toBe(0)
  })
})

describe('LoadScheduler – cancellation of queued entries', () => {
  it('cancelById removes all queued entries for that id', () => {
    const s = new LoadScheduler(1)
    let ran = 0

    s.schedule('active', () => pending()) // occupies the slot
    s.schedule('target', async () => { ran++ })
    s.schedule('other', async () => {})
    s.schedule('target', async () => { ran++ }) // second entry with same id

    expect(s.queueLength).toBe(3)
    s.cancelById('target')
    expect(s.queueLength).toBe(1)
    expect(ran).toBe(0)
  })

  it('cancelById leaves other queued entries intact', async () => {
    const s = new LoadScheduler(1)
    let ranOther = false
    let resolve1!: () => void
    const p1 = new Promise<void>(r => { resolve1 = r })

    s.schedule('active', () => p1)
    s.schedule('remove-me', async () => {})
    s.schedule('keep-me', async () => { ranOther = true })

    s.cancelById('remove-me')
    expect(s.queueLength).toBe(1) // only keep-me remains

    resolve1()
    await p1
    await flushMicrotasks()

    expect(ranOther).toBe(true)
  })

  it('cancelByToken removes only that specific queued entry', () => {
    const s = new LoadScheduler(1)
    let countB = 0, countC = 0

    s.schedule('active', () => pending())
    const tokenB = s.schedule('b', async () => { countB++ })
    s.schedule('c', async () => { countC++ })

    s.cancelByToken(tokenB)

    expect(s.queueLength).toBe(1) // only c remains
    expect(countB).toBe(0)
    expect(countC).toBe(0) // not yet run
  })

  it('cancelById on a running id does not affect the running slot count', () => {
    const s = new LoadScheduler(2)

    s.schedule('a', () => pending())
    s.schedule('b', () => pending())
    // Both slots occupied, nothing queued.
    expect(s.runningCount).toBe(2)

    // cancelById for an id that is running (not queued) — should be a no-op
    s.cancelById('a')
    expect(s.runningCount).toBe(2)
  })

  it('cancelling all queued entries leaves runningCount unchanged', () => {
    const s = new LoadScheduler(1)

    s.schedule('active', () => pending())
    s.schedule('q1', async () => {})
    s.schedule('q2', async () => {})

    s.cancelById('q1')
    s.cancelById('q2')

    expect(s.runningCount).toBe(1)
    expect(s.queueLength).toBe(0)
  })
})

describe('LoadScheduler – active load external stop (slot release via promise settle)', () => {
  it('releases slot when active promise resolves after external stop triggers resolution', async () => {
    const s = new LoadScheduler(1)
    let resolve1!: () => void
    const p1 = new Promise<void>(r => { resolve1 = r })
    let started2 = false

    s.schedule('a', () => p1)
    s.schedule('b', async () => { started2 = true })

    // Simulate external stop: caller resolves the promise (e.g. after wc.stop -> ERR_ABORTED caught)
    resolve1()
    await flushMicrotasks()

    expect(started2).toBe(true)
  })
})
