<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SiteConfig } from '@shared/types'
import { isHttpUrl } from '@shared/configSchema'

const props = defineProps<{
  site: SiteConfig
  isNew: boolean
  /** True while the parent is awaiting the save operation. */
  saving?: boolean
  /** Error message from the last save attempt (empty string = no error). */
  saveError?: string
}>()

const emit = defineEmits<{
  save: [site: SiteConfig]
  cancel: []
}>()

const form = ref({ ...props.site })
const urlError = ref('')

watch(() => props.site, (s) => { form.value = { ...s } }, { deep: true })

function submit() {
  if (props.saving) return
  urlError.value = ''
  if (!form.value.name.trim()) {
    return alert('请填写场地名称')
  }
  if (!isHttpUrl(form.value.url)) {
    urlError.value = '请输入有效的 http/https URL'
    return
  }
  const zoom = Number(form.value.zoomFactor)
  if (!Number.isFinite(zoom) || zoom < 0.1 || zoom > 5) {
    return alert('缩放比例须在 0.1 ~ 5.0 之间')
  }
  emit('save', { ...form.value, zoomFactor: zoom })
}
</script>

<template>
  <div class="modal-overlay" @click.self="!saving && emit('cancel')">
    <div class="modal">
      <h3>{{ isNew ? '添加场地' : '编辑场地' }}</h3>

      <div class="form-row">
        <label>场地名称 *</label>
        <input
          v-model="form.name"
          type="text"
          placeholder="华东一场"
          maxlength="100"
          :disabled="saving"
        />
      </div>

      <div class="form-row">
        <label>URL *</label>
        <input
          v-model="form.url"
          type="url"
          placeholder="https://site.example.com"
          :disabled="saving"
        />
        <span v-if="urlError" style="font-size:11px; color:var(--color-failed)">{{ urlError }}</span>
      </div>

      <div class="form-row">
        <label>页面缩放（0.1 ~ 5.0）</label>
        <input
          v-model.number="form.zoomFactor"
          type="number"
          min="0.1"
          max="5"
          step="0.1"
          style="width:100px"
          :disabled="saving"
        />
      </div>

      <div class="form-row-inline">
        <label class="toggle">
          <input v-model="form.enabled" type="checkbox" :disabled="saving" />
          <span class="toggle-track"><span class="toggle-thumb" /></span>
        </label>
        <span style="font-size:12px;">启用</span>
      </div>

      <!-- Save error from parent -->
      <div
        v-if="saveError"
        style="font-size:11px; color:var(--color-failed); margin-bottom:8px; word-break:break-word;"
      >
        ⚠ {{ saveError }}
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
