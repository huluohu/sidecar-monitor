<script setup lang="ts">
import appIconUrl from '@resources/icon.svg?url'

const props = defineProps<{
  failedCount: number
  isFocused: boolean
  columns: number | 'auto'
  siteCount: number
}>()

const emit = defineEmits<{
  unfocus: []
  refreshAll: []
  toggleFullscreen: []
  openSettings: []
  setColumns: [columns: number | 'auto']
}>()

const COLUMN_OPTIONS = [
  { value: 'auto', label: '自动' },
  ...Array.from({ length: 20 }, (_, index) => ({
    value: index + 1,
    label: `${index + 1} 列`,
  })),
]

const isMacOS = window.monitorAPI.platform === 'darwin'

function onColsChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value
  emit('setColumns', val === 'auto' ? 'auto' : Number(val))
}
</script>

<template>
  <header class="toolbar">
    <span class="toolbar-brand">
      <img
        v-if="isMacOS"
        class="toolbar-logo"
        :src="appIconUrl"
        alt=""
        aria-hidden="true"
      >
      <span class="toolbar-title">sidecar-monitor</span>
    </span>

    <span v-if="siteCount > 0" class="btn toolbar-site-count">
      {{ siteCount }} 场地
    </span>

    <span v-if="failedCount > 0" class="badge-fail">
      ⚠ {{ failedCount }} 异常
    </span>
    <span v-else-if="siteCount > 8" class="toolbar-hint">
      多页面常驻，请关注内存
    </span>

    <div class="toolbar-sep" />

    <label class="toolbar-columns">
      列数
      <select
        :value="columns"
        class="toolbar-columns-select"
        @change="onColsChange"
      >
        <option v-for="opt in COLUMN_OPTIONS" :key="String(opt.value)" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </label>

    <div class="toolbar-spacer" />

    <button v-if="isFocused" class="btn" title="退出聚焦" @click="emit('unfocus')">
      ⊠ 退出聚焦
    </button>

    <button class="btn-icon" title="全部刷新" @click="emit('refreshAll')">⟳</button>
    <button class="btn-icon" title="全屏" @click="emit('toggleFullscreen')">⛶</button>
    <button class="btn-icon" title="设置" @click="emit('openSettings')">⚙</button>
  </header>
</template>
