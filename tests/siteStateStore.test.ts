/**
 * Unit tests for the siteStateStore prune logic (pure store, no Electron).
 * Uses createPinia() from the pinia test utilities.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSiteStateStore } from '../src/renderer/src/stores/siteStateStore'

const fakeState = (id: string) => ({
  id,
  status: 'ready' as const,
  title: id,
  canGoBack: false,
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('siteStateStore.prune', () => {
  it('removes states for IDs not in keepIds', () => {
    const store = useSiteStateStore()
    store.setAll([fakeState('a'), fakeState('b'), fakeState('c')])
    store.prune(new Set(['a', 'c']))
    expect(store.statesMap.has('a')).toBe(true)
    expect(store.statesMap.has('b')).toBe(false)
    expect(store.statesMap.has('c')).toBe(true)
  })

  it('keeps all states when all IDs in keepIds', () => {
    const store = useSiteStateStore()
    store.setAll([fakeState('x'), fakeState('y')])
    store.prune(new Set(['x', 'y']))
    expect(store.statesMap.size).toBe(2)
  })

  it('results in empty map when keepIds is empty', () => {
    const store = useSiteStateStore()
    store.setAll([fakeState('x'), fakeState('y')])
    store.prune(new Set())
    expect(store.statesMap.size).toBe(0)
  })

  it('is idempotent when called multiple times', () => {
    const store = useSiteStateStore()
    store.setAll([fakeState('a'), fakeState('b')])
    store.prune(new Set(['a']))
    store.prune(new Set(['a']))
    expect(store.statesMap.size).toBe(1)
    expect(store.statesMap.has('a')).toBe(true)
  })

  it('does not affect update() after prune', () => {
    const store = useSiteStateStore()
    store.setAll([fakeState('a'), fakeState('b')])
    store.prune(new Set(['a']))
    store.update({ id: 'b', status: 'loading', title: 'B', canGoBack: false })
    expect(store.statesMap.has('b')).toBe(true)
  })
})

describe('siteStateStore.failedCount', () => {
  it('counts failed and crashed states', () => {
    const store = useSiteStateStore()
    store.setAll([
      { id: 'a', status: 'ready', title: 'A', canGoBack: false },
      { id: 'b', status: 'failed', title: 'B', canGoBack: false },
      { id: 'c', status: 'crashed', title: 'C', canGoBack: false },
      { id: 'd', status: 'loading', title: 'D', canGoBack: false },
    ])
    expect(store.failedCount).toBe(2)
  })

  it('updates after prune', () => {
    const store = useSiteStateStore()
    store.setAll([
      { id: 'a', status: 'failed', title: 'A', canGoBack: false },
      { id: 'b', status: 'crashed', title: 'B', canGoBack: false },
    ])
    expect(store.failedCount).toBe(2)
    store.prune(new Set(['a']))
    expect(store.failedCount).toBe(1)
  })
})
