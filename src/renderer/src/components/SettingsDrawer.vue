<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useConfigStore } from '../stores/configStore'
import SiteEditor from './SiteEditor.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import AppIcon from './AppIcon.vue'
import type { SiteConfig } from '@shared/types'
import { withTimeout } from '../utils/withTimeout'
import { randomId } from '../utils/random'

const SAVE_TIMEOUT_MS = 10_000

type ConfirmState = {
  title: string
  message: string
  variant?: 'danger' | 'default'
  onConfirm: () => Promise<void> | void
}

const emit = defineEmits<{
  close: []
  overlayChanged: [active: boolean]
  toast: [message: string, variant: 'success' | 'error' | 'info']
  importConfig: []
  exportConfig: []
}>()
const configStore = useConfigStore()

const editTarget = ref<SiteConfig | null>(null)
const isAdding = ref(false)
const editSaving = ref(false)
const editError = ref('')
const confirmState = ref<ConfirmState | null>(null)
const confirmBusy = ref(false)
const drawerHasOverlay = computed(() => !!editTarget.value || !!confirmState.value)

watch(drawerHasOverlay, active => emit('overlayChanged', active), { immediate: true })
onUnmounted(() => emit('overlayChanged', false))

const allSites = computed(() =>
  [...configStore.config.sites].sort((a, b) => a.order - b.order),
)

async function toggleEnabled(site: SiteConfig) {
  await configStore.upsertSite({ ...site, enabled: !site.enabled })
}

async function deleteSite(id: string) {
  confirmState.value = {
    title: '删除场地',
    message: '删除此场地配置？（会话数据保留）',
    variant: 'danger',
    onConfirm: async () => {
      await configStore.removeSite(id)
    },
  }
}

async function clearSiteData(site: SiteConfig) {
  confirmState.value = {
    title: '清除场地数据',
    message: `清除"${site.name}"保存的登录状态和站点数据？清除后需要重新登录。`,
    variant: 'danger',
    onConfirm: async () => {
      await window.monitorAPI.clearSiteData(site.id)
      if (site.enabled) await window.monitorAPI.refreshSite(site.id)
      emit('toast', '登录状态和站点数据已清除', 'success')
    },
  }
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
  if (editSaving.value) return
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
    editTarget.value = null
  } catch (err) {
    editError.value = err instanceof Error ? err.message : String(err)
  } finally {
    editSaving.value = false
  }
}

async function importConfig() {
  emit('importConfig')
}

async function exportConfig() {
  emit('exportConfig')
}

async function handleConfirm() {
  if (!confirmState.value || confirmBusy.value) return
  confirmBusy.value = true
  try {
    await confirmState.value.onConfirm()
  } catch (error) {
    emit('toast', `操作失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    confirmBusy.value = false
    confirmState.value = null
  }
}

function handleConfirmCancel() {
  if (confirmBusy.value) return
  confirmState.value = null
}
</script>

<template>
  <div class="drawer-overlay" @click.self="emit('close')">
    <div class="drawer">
      <div class="drawer-header">
        <h2>场地设置</h2>
        <button class="btn-icon" title="关闭" @click="emit('close')">
          <AppIcon name="close" :size="14" />
        </button>
      </div>

      <div class="drawer-body">
        <div class="drawer-section-card">
          <div class="drawer-section-title">布局</div>
          <div class="drawer-field-stack">
            <label class="drawer-inline-setting">
              <span class="drawer-inline-label">启动全屏</span>
              <label class="toggle">
                <input
                  type="checkbox"
                  :checked="configStore.config.fullscreenOnLaunch"
                  @change="configStore.setFullscreenOnLaunch(($event.target as HTMLInputElement).checked)"
                >
                <span class="toggle-track"><span class="toggle-thumb" /></span>
              </label>
            </label>
          </div>
        </div>

        <div class="drawer-section-card">
          <div class="drawer-list-header">
            <span class="drawer-section-title drawer-section-title--inline">场地列表</span>
            <button class="btn" @click="addSite">
              <AppIcon name="plus" :size="12" />
              添加
            </button>
          </div>

          <div v-if="allSites.length === 0" class="drawer-empty">
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
                <input type="checkbox" :checked="site.enabled" @change="toggleEnabled(site)" >
                <span class="toggle-track"><span class="toggle-thumb" /></span>
              </label>

              <div class="site-row-info">
                <div class="site-row-name">{{ site.name || '(未命名)' }}</div>
                <div class="site-row-url">{{ site.url }}</div>
              </div>

              <div class="drawer-site-actions">
                <button
                  class="btn-icon"
                  title="清除登录状态"
                  @click="clearSiteData(site)"
                >
                  <AppIcon name="clear-data" :size="12" />
                </button>
                <button
                  class="btn-icon"
                  title="上移"
                  @click="configStore.moveSite(site.id, 'up')"
                >
                  <AppIcon name="arrow-up" :size="12" />
                </button>
                <button
                  class="btn-icon"
                  title="下移"
                  @click="configStore.moveSite(site.id, 'down')"
                >
                  <AppIcon name="arrow-down" :size="12" />
                </button>
                <button
                  class="btn-icon"
                  title="编辑"
                  @click="editSite(site)"
                >
                  <AppIcon name="edit" :size="12" />
                </button>
                <button
                  class="btn-icon btn-danger"
                  title="删除"
                  @click="deleteSite(site.id)"
                >
                  <AppIcon name="trash" :size="12" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="drawer-section-card">
          <div class="drawer-section-title">导入 / 导出</div>
          <div class="drawer-actions-row">
            <button class="btn" @click="importConfig">
              <AppIcon name="import" :size="12" />
              导入配置
            </button>
            <button class="btn" @click="exportConfig">
              <AppIcon name="export" :size="12" />
              导出配置
            </button>
          </div>
          <p class="drawer-note">
            导出仅含场地配置，不含 Cookie 或凭证。导出文件名：sidecar-monitor-config.json
          </p>
        </div>
      </div>
    </div>
  </div>

  <SiteEditor
    v-if="editTarget"
    :site="editTarget"
    :is-new="isAdding"
    :saving="editSaving"
    :save-error="editError"
    @save="onSaveSite"
    @cancel="cancelEdit"
  />

  <ConfirmDialog
    v-if="confirmState"
    :title="confirmState.title"
    :message="confirmState.message"
    :variant="confirmState.variant"
    :busy="confirmBusy"
    @confirm="handleConfirm"
    @cancel="handleConfirmCancel"
  />
</template>
