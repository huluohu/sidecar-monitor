<script setup lang="ts">
import { computed } from 'vue'
import type { SiteConfig, SiteState } from '@shared/types'

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
  props.focusedId ? 1 : Math.max(1, Math.ceil(props.sites.length / cols.value))
)

function stateOf(id: string): SiteState | undefined {
  return props.statesMap.get(id)
}
</script>

<template>
  <!-- CSS grid drives the visual cell layout.
       Each cell height includes the title bar (--cell-title-h) + a placeholder body.
       The actual content is rendered by WebContentsViews positioned by the main process. -->
  <div
    class="grid-css"
    :style="{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      width: '100%',
      height: '100%',
    }"
  >
    <div
      v-for="site in sites"
      :key="site.id"
      :data-site-id="site.id"
      class="grid-cell"
      :style="focusedId && focusedId !== site.id ? { display: 'none' } : {}"
    >
      <!-- Title bar — rendered by Vue, visible above WebContentsView -->
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
          >←</button>

          <button
            class="cell-btn"
            title="刷新"
            @click="api.refreshSite(site.id)"
          >⟳</button>

          <button
            v-if="stateOf(site.id)?.status === 'failed' || stateOf(site.id)?.status === 'crashed'"
            class="cell-btn"
            title="恢复"
            style="color: var(--color-failed)"
            @click="api.recoverSite(site.id)"
          >↺</button>

          <button
            class="cell-btn"
            title="缩小"
            @click="api.setSiteZoom(site.id, Math.max(0.1, site.zoomFactor - 0.1))"
          >−</button>

          <button
            class="cell-btn"
            title="放大"
            @click="api.setSiteZoom(site.id, Math.min(5, site.zoomFactor + 0.1))"
          >＋</button>

          <button
            v-if="focusedId === site.id"
            class="cell-btn"
            title="退出聚焦"
            @click="emit('unfocus')"
          >✕</button>
          <button
            v-else
            class="cell-btn"
            title="聚焦此场地"
            @click="emit('focus', site.id)"
          >⊡</button>
        </div>
      </div>

      <!-- Body placeholder — WebContentsView is placed here by main process -->
      <div class="cell-body">
        <!-- Show overlay only for non-ready states -->
        <div
          class="cell-overlay"
          :class="{ hidden: stateOf(site.id)?.status === 'ready' }"
        >
          <div class="cell-overlay-icon">
            <template v-if="stateOf(site.id)?.status === 'loading'">⏳</template>
            <template v-else-if="stateOf(site.id)?.status === 'failed'">⚠</template>
            <template v-else-if="stateOf(site.id)?.status === 'crashed'">💥</template>
            <template v-else>⏳</template>
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
            class="btn"
            style="margin-top:6px;"
            @click="api.recoverSite(site.id)"
          >重试</button>
        </div>
      </div>
    </div>
  </div>
</template>
