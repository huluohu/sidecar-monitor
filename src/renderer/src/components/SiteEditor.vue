<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SiteConfig } from '@shared/types'
import { isHttpUrl } from '@shared/configSchema'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  site: SiteConfig
  isNew: boolean
  saving?: boolean
  saveError?: string
}>()

const emit = defineEmits<{
  save: [site: SiteConfig]
  cancel: []
}>()

const form = ref({ ...props.site })
const nameError = ref('')
const urlError = ref('')
const zoomError = ref('')

watch(
  () => props.site,
  (site) => {
    form.value = { ...site }
    nameError.value = ''
    urlError.value = ''
    zoomError.value = ''
  },
  { deep: true },
)

function submit() {
  if (props.saving) return
  nameError.value = ''
  zoomError.value = ''
  urlError.value = ''
  if (!form.value.name.trim()) {
    nameError.value = '请填写场地名称'
    return
  }
  if (!isHttpUrl(form.value.url)) {
    urlError.value = '请输入有效的 http/https URL'
    return
  }
  const zoom = Number(form.value.zoomFactor)
  if (!Number.isFinite(zoom) || zoom < 0.1 || zoom > 5) {
    zoomError.value = '缩放比例须在 0.1 ~ 5.0 之间'
    return
  }
  emit('save', { ...form.value, zoomFactor: zoom })
}
</script>

<template>
  <div class="modal-overlay" @click.self="!saving && emit('cancel')">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="site-editor-title">
      <h3 id="site-editor-title">{{ isNew ? '添加场地' : '编辑场地' }}</h3>

      <div class="form-row">
        <label>场地名称 *</label>
        <input
          v-model="form.name"
          type="text"
          placeholder="华东一场"
          maxlength="100"
          :disabled="saving"
        >
        <span v-if="nameError" class="form-error">{{ nameError }}</span>
      </div>

      <div class="form-row">
        <label>URL *</label>
        <input
          v-model="form.url"
          type="url"
          placeholder="https://site.example.com"
          :disabled="saving"
        >
        <span v-if="urlError" class="form-error">{{ urlError }}</span>
      </div>

      <div class="form-row">
        <label>页面缩放（0.1 ~ 5.0）</label>
        <input
          v-model.number="form.zoomFactor"
          class="input-narrow"
          type="number"
          min="0.1"
          max="5"
          step="0.1"
          :disabled="saving"
        >
        <span v-if="zoomError" class="form-error">{{ zoomError }}</span>
      </div>

      <div class="form-row-inline">
        <label class="toggle">
          <input v-model="form.enabled" type="checkbox" :disabled="saving" >
          <span class="toggle-track"><span class="toggle-thumb" /></span>
        </label>
        <span class="form-inline-label">启用</span>
      </div>

      <div v-if="saveError" class="form-error form-error-block">
        <AppIcon name="warning" :size="12" />
        {{ saveError }}
      </div>

      <div class="modal-actions">
        <button class="btn" :disabled="saving" @click="emit('cancel')">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="submit">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>
