<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  variant?: 'danger' | 'default'
}>(), {
  confirmLabel: '确认',
  cancelLabel: '取消',
  busy: false,
  variant: 'default',
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const titleId = `confirm-dialog-title-${Math.random().toString(36).slice(2, 10)}`

const confirmClass = computed(() =>
  props.variant === 'danger' ? 'btn btn-danger-solid' : 'btn btn-primary',
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.busy) {
    emit('cancel')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="modal-overlay confirm-overlay" @click.self="!busy && emit('cancel')">
    <div
      class="modal confirm-modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
    >
      <h3 :id="titleId">{{ title }}</h3>
      <p class="confirm-message">{{ message }}</p>
      <div class="modal-actions">
        <button class="btn" :disabled="busy" @click="emit('cancel')">{{ cancelLabel }}</button>
        <button :class="confirmClass" :disabled="busy" @click="emit('confirm')">
          <AppIcon v-if="busy" name="loading" :size="12" />
          {{ busy ? '处理中…' : confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
