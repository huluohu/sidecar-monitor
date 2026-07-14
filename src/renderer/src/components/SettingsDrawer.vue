<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '../stores/configStore'
import SiteEditor from './SiteEditor.vue'
import type { SiteConfig } from '@shared/types'
import { withTimeout } from '../utils/withTimeout'
import { randomId } from '../utils/random'

const SAVE_TIMEOUT_MS = 10_000

const emit = defineEmits<{ close: [] }>()
const configStore = useConfigStore()

const editTarget = ref<SiteConfig | null>(null)
const isAdding = ref(false)
const editSaving = ref(false)
const editError = ref('')

// All sites (enabled + disabled), sorted by order
const allSites = computed(() =>
  [...configStore.config.sites].sort((a, b) => a.order - b.order)
)

async function toggleEnabled(site: SiteConfig) {
  await configStore.upsertSite({ ...site, enabled: !site.enabled })
}

async function deleteSite(id: string) {
  if (!confirm('删除此场地配置？（会话数据保留）')) return
  await configStore.removeSite(id)
}

async function clearSiteData(site: SiteConfig) {
  if (!confirm(`清除"${site.name}"保存的登录状态和站点数据？清除后需要重新登录。`)) return
  await window.monitorAPI.clearSiteData(site.id)
  if (site.enabled) await window.monitorAPI.refreshSite(site.id)
  alert('登录状态和站点数据已清除')
}

function editSite(site: SiteConfig) {
  editTarget.value = { ...site }
  isAdding.value = false
  editError.value = ''
}

function addSite() {
  editTarget.value = {
    id: randomId(),
    name: '',
    url: 'https://',
    enabled: true,
    order: configStore.config.sites.length,
    zoomFactor: 0.8,
  }
  isAdding.value = true
  editError.value = ''
}

function cancelEdit() {
  if (editSaving.value) return // prevent cancel while saving
  editTarget.value = null
  editError.value = ''
}

async function onSaveSite(site: SiteConfig) {
  if (editSaving.value) return
  editSaving.value = true
  editError.value = ''
  try {
    const saveOp = configStore.upsertSite(site)
    await withTimeout(saveOp, SAVE_TIMEOUT_MS, '保存超时：主进程 10 秒内未响应，请检查应用状态')
    // Close modal only on success
    editTarget.value = null
  } catch (err) {
    // Do NOT close modal on failure — user needs to see the error
    editError.value = err instanceof Error ? err.message : String(err)
  } finally {
    editSaving.value = false
  }
}

async function importConfig() {
  try {
    const imported = await window.monitorAPI.importConfig()
    if (imported) {
      await configStore.save(imported)
    }
  } catch (error) {
    alert(`导入失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function exportConfig() {
  try {
    await window.monitorAPI.exportConfig()
  } catch (error) {
    alert(`导出失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
</script>

<template>
  <div class="drawer-overlay" @click.self="emit('close')">
    <div class="drawer">
      <div class="drawer-header">
        <h2>场地设置</h2>
        <button class="btn-icon" title="关闭" @click="emit('close')">✕</button>
      </div>

      <div class="drawer-body">
        <!-- Global settings -->
        <div>
          <div class="drawer-section-title">布局</div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <label style="display:flex; align-items:center; gap:8px; font-size:12px;">
              <span style="flex:1">启动全屏</span>
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="configStore.config.fullscreenOnLaunch"
                  @change="configStore.setFullscreenOnLaunch(($event.target as HTMLInputElement).checked)"
                />
                <span class="toggle-track"><span class="toggle-thumb" /></span>
              </label>
            </label>
          </div>
        </div>

        <!-- Site list -->
        <div>
          <div style="display:flex; align-items:center; margin-bottom:8px;">
            <span class="drawer-section-title" style="margin-bottom:0; flex:1">场地列表</span>
            <button class="btn" style="font-size:11px;" @click="addSite">+ 添加</button>
          </div>

          <div v-if="allSites.length === 0" style="color: var(--color-text-muted); font-size:12px;">
            暂无场地
          </div>

          <div class="site-list">
            <div
              v-for="site in allSites"
              :key="site.id"
              class="site-row"
              :class="{ 'site-row-disabled': !site.enabled }"
            >
              <label class="toggle">
                <input type="checkbox" :checked="site.enabled" @change="toggleEnabled(site)" />
                <span class="toggle-track"><span class="toggle-thumb" /></span>
              </label>

              <div class="site-row-info">
                <div class="site-row-name">{{ site.name || '(未命名)' }}</div>
                <div class="site-row-url">{{ site.url }}</div>
              </div>

              <div style="display:flex; gap:2px;">
                <button
                  class="btn-icon"
                  style="font-size:12px;"
                  title="清除登录状态"
                  @click="clearSiteData(site)"
                >⌫</button>
                <button
                  class="btn-icon"
                  style="font-size:12px;"
                  title="上移"
                  @click="configStore.moveSite(site.id, 'up')"
                >↑</button>
                <button
                  class="btn-icon"
                  style="font-size:12px;"
                  title="下移"
                  @click="configStore.moveSite(site.id, 'down')"
                >↓</button>
                <button
                  class="btn-icon"
                  style="font-size:12px;"
                  title="编辑"
                  @click="editSite(site)"
                >✎</button>
                <button
                  class="btn-icon btn-danger"
                  style="font-size:12px;"
                  title="删除"
                  @click="deleteSite(site.id)"
                >🗑</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Import / Export -->
        <div>
          <div class="drawer-section-title">导入 / 导出</div>
          <div style="display:flex; gap:8px;">
            <button class="btn" style="font-size:11px;" @click="importConfig">导入配置</button>
            <button class="btn" style="font-size:11px;" @click="exportConfig">导出配置</button>
          </div>
          <p style="font-size:10px; color:var(--color-text-muted); margin-top:6px;">
            导出仅含场地配置，不含 Cookie 或凭证。导出文件名：sidecar-monitor-config.json
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit / Add modal -->
  <SiteEditor
    v-if="editTarget"
    :site="editTarget"
    :is-new="isAdding"
    :saving="editSaving"
    :save-error="editError"
    @save="onSaveSite"
    @cancel="cancelEdit"
  />
</template>
