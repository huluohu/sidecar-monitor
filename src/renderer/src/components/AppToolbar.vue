<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import appIconUrl from '@resources/icon.svg?url'
import AppIcon from './AppIcon.vue'
import { APP_MENU_ITEMS } from '../utils/appMenuItems'
import type { AppMenuActionId } from '../utils/appMenuItems'

const props = defineProps<{
  failedCount: number
  isFocused: boolean
  columns: number | 'auto'
  siteCount: number
  isFullscreen: boolean
}>()

const emit = defineEmits<{
  unfocus: []
  refreshAll: []
  toggleFullscreen: []
  openSettings: []
  setColumns: [columns: number | 'auto']
  importConfig: []
  exportConfig: []
}>()

const COLUMN_OPTIONS = [
  { value: 'auto', label: '自动' },
  ...Array.from({ length: 20 }, (_, index) => ({
    value: index + 1,
    label: `${index + 1} 列`,
  })),
]

const isMacOS = window.monitorAPI.platform === 'darwin'
const usesWindowControlsOverlay =
  window.monitorAPI.platform === 'win32' || window.monitorAPI.platform === 'linux'

// Native menu bar is not rendered on Linux/Windows (titleBarStyle: 'hidden');
// this dropdown keeps every menu capability reachable there.
const menuOpen = ref(false)

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function onMenuItem(id: AppMenuActionId) {
  menuOpen.value = false
  switch (id) {
    case 'settings':
      emit('openSettings')
      break
    case 'import-config':
      emit('importConfig')
      break
    case 'export-config':
      emit('exportConfig')
      break
    default:
      window.monitorAPI.appMenuAction(id).catch(() => undefined)
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => window.removeEventListener('keydown', onGlobalKeydown))

function onColsChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value
  emit('setColumns', val === 'auto' ? 'auto' : Number(val))
}
</script>

<template>
  <header
    class="toolbar"
    :class="{
      'toolbar--macos': isMacOS,
      'toolbar--window-overlay': usesWindowControlsOverlay,
      'toolbar--fullscreen': isFullscreen,
    }"
  >
    <span class="toolbar-brand">
      <img
        v-if="isMacOS"
        class="toolbar-logo"
        :src="appIconUrl"
        alt=""
        aria-hidden="true"
      >
      <span class="toolbar-title">Sidecar Monitor</span>
    </span>

    <span v-if="siteCount > 0" class="toolbar-badge">
      {{ siteCount }} 场地
    </span>

    <span v-if="failedCount > 0" class="badge-fail">
      <AppIcon name="warning" :size="12" />
      {{ failedCount }} 异常
    </span>
    <span v-else-if="siteCount > 8" class="toolbar-hint">
      多页面常驻，请关注内存
    </span>

    <div class="toolbar-sep" />

    <label class="toolbar-columns">
      <span class="toolbar-columns-label">列数</span>
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
      <AppIcon name="fullscreen-exit" :size="13" />
      退出聚焦
    </button>

    <button class="btn-icon" title="全部刷新" @click="emit('refreshAll')">
      <AppIcon name="refresh" :size="14" />
    </button>
    <button
      class="btn-icon"
      :title="isFullscreen ? '退出全屏' : '全屏'"
      @click="emit('toggleFullscreen')"
    >
      <AppIcon :name="isFullscreen ? 'fullscreen-exit' : 'fullscreen-enter'" :size="14" />
    </button>
    <button class="btn-icon" title="设置" @click="emit('openSettings')">
      <AppIcon name="settings" :size="14" />
    </button>

    <div v-if="usesWindowControlsOverlay" class="toolbar-menu">
      <button
        v-if="!menuOpen"
        class="btn-icon toolbar-menu-btn"
        title="菜单"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        @click="toggleMenu"
      >
        <AppIcon name="menu" :size="14" />
      </button>
      <div v-else class="toolbar-menu-backdrop" @click="menuOpen = false" />
      <div v-if="menuOpen" class="app-menu-panel" role="menu">
        <template v-for="(item, index) in APP_MENU_ITEMS" :key="index">
          <div v-if="item.kind === 'separator'" class="app-menu-sep" />
          <button
            v-else
            class="app-menu-item"
            role="menuitem"
            :data-menu-id="item.id"
            @click="onMenuItem(item.id)"
          >
            <span>{{ item.label }}</span>
            <kbd v-if="item.shortcut" class="app-menu-shortcut">{{ item.shortcut }}</kbd>
          </button>
        </template>
      </div>
    </div>
  </header>
</template>
