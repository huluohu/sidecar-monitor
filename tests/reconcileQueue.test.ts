import { describe, it, expect, vi } from 'vitest'
import { ReconcileQueue } from '../src/main/reconcileQueue'

/** Flush all pending microtasks/promises. */
function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

describe('ReconcileQueue', () => {
  it('defers execution until the current event-loop turn completes', async () => {
    const called: number[] = []
    const q = new ReconcileQueue<number>(async (n) => {
      called.push(n)
    })
    q.schedule(1)
    expect(called).toEqual([])
    await flushMicrotasks()
    expect(called).toEqual([1])
  })

  it('collapses same-turn submissions before starting the executor', async () => {
    const called: number[] = []
    const q = new ReconcileQueue<number>(async n => {
      called.push(n)
    })
    q.schedule(1)
    q.schedule(2)
    q.schedule(3)
    expect(called).toEqual([])
    await flushMicrotasks()
    expect(called).toEqual([3])
  })

  it('collapses consecutive schedules into one execution with latest value', async () => {
    const called: number[] = []
    let resolve1!: () => void
    const blocker = new Promise<void>(r => { resolve1 = r })

    const q = new ReconcileQueue<number>(async (n) => {
      if (n === 1) await blocker
      called.push(n)
    })

    q.schedule(1) // starts running
    await flushMicrotasks()
    q.schedule(2) // pending — queued
    q.schedule(3) // pending — replaces 2
    q.schedule(4) // pending — replaces 3

    // Unblock first execution
    resolve1()
    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    // Should have run: 1, then 4 (2 and 3 were collapsed)
    expect(called).toEqual([1, 4])
  })

  it('reflects isRunning state', async () => {
    let resolveExec!: () => void
    const q = new ReconcileQueue<string>(async () => {
      await new Promise<void>(r => { resolveExec = r })
    })
    expect(q.isRunning).toBe(false)
    q.schedule('x')
    await flushMicrotasks()
    expect(q.isRunning).toBe(true)
    resolveExec()
    await flushMicrotasks()
    await flushMicrotasks()
    expect(q.isRunning).toBe(false)
  })

  it('hasPending is true only while a value awaits execution', async () => {
    let resolveExec!: () => void
    const q = new ReconcileQueue<string>(async () => {
      await new Promise<void>(r => { resolveExec = r })
    })
    q.schedule('a')
    await flushMicrotasks()
    // currently running 'a', no pending
    expect(q.hasPending).toBe(false)
    q.schedule('b')
    expect(q.hasPending).toBe(true)
    resolveExec()
    await flushMicrotasks()
    await flushMicrotasks()
    expect(q.hasPending).toBe(false)
  })

  it('continues running after executor error', async () => {
    const called: number[] = []
    const q = new ReconcileQueue<number>(async (n) => {
      if (n === 1) throw new Error('boom')
      called.push(n)
    })
    q.schedule(1)
    await flushMicrotasks()
    q.schedule(2)
    await flushMicrotasks()
    await flushMicrotasks()
    expect(called).toEqual([2])
  })

  it('runs multiple sequential schedules one by one', async () => {
    const order: number[] = []
    const q = new ReconcileQueue<number>(async (n) => {
      await flushMicrotasks()
      order.push(n)
    })
    q.schedule(1)
    await flushMicrotasks()
    await flushMicrotasks()
    q.schedule(2)
    await flushMicrotasks()
    await flushMicrotasks()
    expect(order).toEqual([1, 2])
  })
})
