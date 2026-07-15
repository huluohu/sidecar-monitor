<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{
  message: string
  variant?: 'success' | 'error' | 'info'
  visible: boolean
}>(), {
  variant: 'info',
})

const emit = defineEmits<{
  dismiss: []
}>()

const role = computed(() => (props.variant === 'error' ? 'alert' : 'status'))
const liveMode = computed(() => (props.variant === 'error' ? 'assertive' : 'polite'))
let timer: ReturnType<typeof setTimeout> | null = null

function clearDismissTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

watch(
  () => props.visible,
  visible => {
    clearDismissTimer()
    if (!visible) return
    timer = setTimeout(() => emit('dismiss'), 3000)
  },
)

onUnmounted(() => {
  clearDismissTimer()
})
</script>

<template>
  <Transition name="toast">
    <div
      v-if="visible"
      :class="['toast', `toast-${variant}`]"
      :role="role"
      :aria-live="liveMode"
    >
      <AppIcon v-if="variant === 'success'" name="check-circle" :size="14" />
      <AppIcon v-else-if="variant === 'error'" name="x-circle" :size="14" />
      <span>{{ message }}</span>
    </div>
  </Transition>
</template>
