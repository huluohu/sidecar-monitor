<script setup lang="ts">
import type { AppMetrics } from '@shared/types'

const props = defineProps<{
  metrics: AppMetrics
  failedCount: number
}>()
</script>

<template>
  <footer class="status-bar">
    <span class="status-item">
      <span class="status-dot" :class="failedCount === 0 ? 'ok' : 'warn'" />
      {{ metrics.siteCount }} 场地
    </span>
    <span v-if="failedCount > 0" class="status-item status-item--warn">
      {{ failedCount }} 异常
    </span>
    <span v-if="metrics.memoryMB > 0" class="status-item">
      内存 {{ metrics.memoryMB }} MB
    </span>
  </footer>
</template>
