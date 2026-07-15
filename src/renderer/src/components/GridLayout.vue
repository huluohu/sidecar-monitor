<script setup lang="ts">
import { computed } from 'vue'
import type { SiteConfig, SiteState } from '@shared/types'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  sites: SiteConfig[]
  statesMap: Map<string, SiteState>
  focusedId: string | null
  effectiveCols: number
}>()

const emit = defineEmits<{
  focus: [id: string]
  unfocus: []
}>()

const api = window.monitorAPI

/**
 * The grid layout is purely for the cell-title bars rendered by Vue.
 * The actual WebContentsView bodies are positioned by the main process.
 * We compute positions using CSS: CSS grid here, bounds sent via IPC in App.vue.
 */
const cols = computed(() => Math.max(1, props.effectiveCols))
const rows = computed(() =>
  props.focusedId ? 1 : Math.max(1, Math.ceil(props.sites.length / cols.value)),
)

function stateOf(id: string): SiteState | undefined {
  return props.statesMap.get(id)
}
</script>

<template>
  <div
    class="grid-css"
    :style="{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    }"
  >
    <div
      v-for="site in sites"
      :key="site.id"
      :data-site-id="site.id"
      class="grid-cell"
      :class="{
        'grid-cell--hidden': focusedId && focusedId !== site.id,
        'grid-cell--focused': focusedId === site.id,
      }"
    >
      <div class="cell-title">
        <span
          class="cell-status-dot"
          :class="stateOf(site.id)?.status ?? 'loading'"
        />
        <span class="cell-name" :title="site.name">{{ site.name }}</span>
        <div class="cell-actions">
          <button
            v-if="stateOf(site.id)?.canGoBack"
            class="cell-btn"
            title="后退"
            @click="api.goBack(site.id)"
          >
            <AppIcon name="arrow-left" :size="12" />
          </button>

          <button
            class="cell-btn"
            title="刷新"
            @click="api.refreshSite(site.id)"
          >
            <AppIcon name="refresh" :size="12" />
          </button>

          <button
            v-if="stateOf(site.id)?.status === 'failed' || stateOf(site.id)?.status === 'crashed'"
            class="cell-btn cell-btn--danger"
            title="恢复"
            @click="api.recoverSite(site.id)"
          >
            <AppIcon name="recover" :size="12" />
          </button>

          <button
            class="cell-btn"
            title="缩小"
            @click="api.setSiteZoom(site.id, Math.max(0.1, site.zoomFactor - 0.1))"
          >
            <AppIcon name="zoom-out" :size="12" />
          </button>

          <button
            class="cell-btn"
            title="放大"
            @click="api.setSiteZoom(site.id, Math.min(5, site.zoomFactor + 0.1))"
          >
            <AppIcon name="zoom-in" :size="12" />
          </button>

          <button
            v-if="focusedId === site.id"
            class="cell-btn"
            title="退出聚焦"
            @click="emit('unfocus')"
          >
            <AppIcon name="close" :size="12" />
          </button>
          <button
            v-else
            class="cell-btn"
            title="聚焦此场地"
            @click="emit('focus', site.id)"
          >
            <AppIcon name="maximize" :size="12" />
          </button>
        </div>
      </div>

      <div class="cell-body">
        <div
          class="cell-overlay"
          :class="{ hidden: stateOf(site.id)?.status === 'ready' }"
        >
          <div class="cell-overlay-icon">
            <AppIcon
              v-if="stateOf(site.id)?.status === 'failed'"
              name="warning"
              :size="28"
            />
            <AppIcon
              v-else-if="stateOf(site.id)?.status === 'crashed'"
              name="crashed"
              :size="28"
            />
            <AppIcon
              v-else
              name="loading"
              :size="28"
            />
          </div>
          <div class="cell-overlay-msg">
            <template v-if="stateOf(site.id)?.status === 'loading'">加载中…</template>
            <template v-else-if="stateOf(site.id)?.status === 'failed'">加载失败</template>
            <template v-else-if="stateOf(site.id)?.status === 'crashed'">渲染进程崩溃</template>
          </div>
          <div
            v-if="stateOf(site.id)?.failReason"
            class="cell-overlay-err"
          >{{ stateOf(site.id)?.failReason }}</div>
          <button
            v-if="stateOf(site.id)?.status === 'failed' || stateOf(site.id)?.status === 'crashed'"
            class="btn cell-overlay-action"
            @click="api.recoverSite(site.id)"
          >重试</button>
        </div>
      </div>
    </div>
  </div>
</template>
