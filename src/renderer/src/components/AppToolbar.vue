<script setup lang="ts">
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

function onColsChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value
  emit('setColumns', val === 'auto' ? 'auto' : Number(val))
}
</script>

<template>
  <header class="toolbar">
    <span class="toolbar-title">sidecar-monitor</span>

    <span v-if="siteCount > 0" class="btn" style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-dim)">
      {{ siteCount }} 场地
    </span>

    <span v-if="failedCount > 0" class="badge-fail">
      ⚠ {{ failedCount }} 异常
    </span>
    <span v-else-if="siteCount > 8" class="toolbar-hint">
      多页面常驻，请关注内存
    </span>

    <div class="toolbar-sep" />

    <label style="font-size: 11px; color: var(--color-text-dim); display:flex; align-items:center; gap:4px;">
      列数
      <select
        :value="columns"
        style="height:26px; font-size:11px; padding:0 4px;"
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
