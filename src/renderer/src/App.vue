<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useConfigStore } from './stores/configStore'
import { useSiteStateStore } from './stores/siteStateStore'
import { autoColumns } from './utils/layout'
import type { SlotBounds } from '@shared/types'
import AppToolbar from './components/AppToolbar.vue'
import GridLayout from './components/GridLayout.vue'
import StatusBar from './components/StatusBar.vue'
import SettingsDrawer from './components/SettingsDrawer.vue'

const configStore = useConfigStore()
const stateStore = useSiteStateStore()

const gridAreaRef = ref<HTMLElement | null>(null)
const focusedId = ref<string | null>(null)
const showSettings = ref(false)
const metrics = ref({ siteCount: 0, failedCount: 0, memoryMB: 0 })
const layoutColumns = ref(1)

// Pending bounds flush (debounced via rAF)
let rafId: number | null = null

function scheduleBoundsFlush() {
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    rafId = null
    flushBounds()
  })
}

function flushBounds() {
  const el = gridAreaRef.value
  if (!el) return
  const sites = configStore.enabledSites
  if (sites.length === 0) return

  const rect = el.getBoundingClientRect()
  const W = rect.width
  const H = rect.height
  if (W < 1 || H < 1) return

  const cfg = configStore.config
  const cols = focusedId.value
    ? 1
    : cfg.columns === 'auto'
      ? autoColumns(sites.length, W, H)
      : Math.max(1, Math.min(cfg.columns, sites.length))
  if (layoutColumns.value !== cols) {
    layoutColumns.value = cols
    nextTick(scheduleBoundsFlush)
    return
  }

  const bounds: SlotBounds[] = []
  for (const cell of document.querySelectorAll<HTMLElement>('[data-site-id]')) {
    const body = cell.querySelector<HTMLElement>('.cell-body')
    const id = cell.dataset.siteId
    if (!body || !id || body.offsetParent === null) continue
    const bodyRect = body.getBoundingClientRect()
    bounds.push({
      id,
      x: Math.round(bodyRect.left),
      y: Math.round(bodyRect.top),
      width: Math.max(0, Math.round(bodyRect.width)),
      height: Math.max(0, Math.round(bodyRect.height)),
    })
  }
  window.monitorAPI.setBounds(bounds).catch(() => undefined)
}

// ResizeObserver
let ro: ResizeObserver | null = null

function setupResizeObserver() {
  if (!gridAreaRef.value) return
  ro = new ResizeObserver(() => scheduleBoundsFlush())
  ro.observe(gridAreaRef.value)
}

// IPC event cleanup functions
let unsubState: (() => void) | null = null
let unsubConfig: (() => void) | null = null
let unsubMetrics: (() => void) | null = null

onMounted(async () => {
  await configStore.load()
  const states = await window.monitorAPI.getSiteStates()
  stateStore.setAll(states)

  unsubState = window.monitorAPI.onSiteStateChanged(state => {
    stateStore.update(state)
  })

  // CONFIG_CHANGED is sent for main-initiated changes (zoom, move).
  // Do NOT call getSiteStates() here — that would cause a nested IPC invoke.
  // New site states arrive via SITE_STATE_CHANGED as views load.
  unsubConfig = window.monitorAPI.onConfigChanged(cfg => {
    configStore.applyExternalUpdate(cfg)
    // Prune state store: remove entries for sites that are no longer enabled.
    const enabledIds = new Set(cfg.sites.filter(s => s.enabled).map(s => s.id))
    stateStore.prune(enabledIds)
    nextTick(scheduleBoundsFlush)
  })

  unsubMetrics = window.monitorAPI.onMetricsUpdate(m => {
    metrics.value = m
  })

  await nextTick()
  setupResizeObserver()
  scheduleBoundsFlush()
})

onUnmounted(() => {
  ro?.disconnect()
  unsubState?.()
  unsubConfig?.()
  unsubMetrics?.()
  if (rafId !== null) cancelAnimationFrame(rafId)
})

// Re-flush when config changes (column count, site list)
watch(() => configStore.enabledSites, (sites) => {
  if (focusedId.value && !sites.some(site => site.id === focusedId.value)) {
    focusedId.value = null
    window.monitorAPI.focusSite(null).catch(() => undefined)
  }
  scheduleBoundsFlush()
}, { deep: true })
watch(() => configStore.config.columns, () => scheduleBoundsFlush())
watch(showSettings, (visible) => {
  window.monitorAPI.setSiteViewsVisible(!visible).catch(() => undefined)
  if (!visible) nextTick(scheduleBoundsFlush)
})

async function handleFocus(id: string) {
  focusedId.value = id
  await window.monitorAPI.focusSite(id)
  scheduleBoundsFlush()
}

async function handleUnfocus() {
  focusedId.value = null
  await window.monitorAPI.focusSite(null)
  scheduleBoundsFlush()
}

async function handleRefreshAll() {
  if (!confirm('刷新所有场地页面？')) return
  await window.monitorAPI.refreshAll()
}

function handleToggleFullscreen() {
  window.monitorAPI.toggleFullscreen().catch(() => undefined)
}

</script>

<template>
  <div class="app-root">
    <AppToolbar
      :failed-count="stateStore.failedCount"
      :is-focused="focusedId !== null"
      :columns="configStore.config.columns"
      :site-count="configStore.enabledSites.length"
      @unfocus="handleUnfocus"
      @refresh-all="handleRefreshAll"
      @toggle-fullscreen="handleToggleFullscreen"
      @open-settings="showSettings = true"
      @set-columns="c => configStore.setColumns(c)"
    />

    <div ref="gridAreaRef" class="grid-area">
      <GridLayout
        v-if="configStore.enabledSites.length > 0"
        :sites="configStore.enabledSites"
        :states-map="stateStore.statesMap"
        :focused-id="focusedId"
        :effective-cols="layoutColumns"
        @focus="handleFocus"
        @unfocus="handleUnfocus"
      />
      <div v-else class="empty-state">
        <div class="empty-state-icon">🖥</div>
        <div>暂无场地，点击右上角⚙ 添加</div>
      </div>
    </div>

    <StatusBar :metrics="metrics" :failed-count="stateStore.failedCount" />

    <SettingsDrawer
      v-if="showSettings"
      @close="showSettings = false"
    />
  </div>
</template>
