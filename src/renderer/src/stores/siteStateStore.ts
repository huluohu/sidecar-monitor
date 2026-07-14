import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SiteState } from '@shared/types'

export const useSiteStateStore = defineStore('siteState', () => {
  const statesMap = ref(new Map<string, SiteState>())

  function update(state: SiteState): void {
    statesMap.value.set(state.id, { ...state })
    // Trigger reactivity
    statesMap.value = new Map(statesMap.value)
  }

  function setAll(states: SiteState[]): void {
    const m = new Map<string, SiteState>()
    for (const s of states) m.set(s.id, { ...s })
    statesMap.value = m
  }

  /**
   * Remove states for IDs not in `keepIds`.
   * Called after CONFIG_CHANGED to prune states for disabled/removed sites.
   * New site states arrive via SITE_STATE_CHANGED events as they load.
   */
  function prune(keepIds: Set<string>): void {
    const m = new Map<string, SiteState>()
    for (const [id, state] of statesMap.value) {
      if (keepIds.has(id)) m.set(id, state)
    }
    statesMap.value = m
  }

  function get(id: string): SiteState | undefined {
    return statesMap.value.get(id)
  }

  const failedCount = computed(() => {
    let n = 0
    for (const s of statesMap.value.values()) {
      if (s.status === 'failed' || s.status === 'crashed') n++
    }
    return n
  })

  return { statesMap, update, setAll, prune, get, failedCount }
})
