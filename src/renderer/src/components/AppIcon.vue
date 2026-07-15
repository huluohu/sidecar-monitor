<script setup lang="ts">
withDefaults(defineProps<{
  name: string
  size?: number
}>(), {
  size: 16,
})
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'refresh'">
      <path d="M13 5V2.75H10.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12.4 7A4.9 4.9 0 0 0 3.8 4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M3 11v2.25h2.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M3.6 9A4.9 4.9 0 0 0 12.2 11.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'fullscreen-enter'">
      <path d="M6 2.5H2.5V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M2.8 2.8 6.2 6.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M10 2.5h3.5V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="m13.2 2.8-3.4 3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M6 13.5H2.5V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="m2.8 13.2 3.4-3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M10 13.5h3.5V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="m13.2 13.2-3.4-3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'fullscreen-exit'">
      <path d="M6 6H2.5V2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="m2.8 2.8 3.4 3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M10 6h3.5V2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="m13.2 2.8-3.4 3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M6 10H2.5v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="m2.8 13.2 3.4-3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M10 10h3.5v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="m13.2 13.2-3.4-3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'settings'">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.5" />
      <path d="M8 1.8v1.4M8 12.8v1.4M3.2 8H1.8M14.2 8h-1.4M4.2 4.2l1 1M10.8 10.8l1 1M11.8 4.2l-1 1M5.2 10.8l-1 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <circle cx="8" cy="8" r="5.1" stroke="currentColor" stroke-width="1.5" stroke-dasharray="0.01 2.6" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'close'">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'arrow-left'">
      <path d="m9.8 3.5-4 4 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <template v-else-if="name === 'recover'">
      <path d="M3 5V2.75h2.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M3.8 4.6A4.9 4.9 0 0 1 12.4 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M13 11v2.25h-2.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12.2 11.4A4.9 4.9 0 0 1 3.6 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'zoom-out'">
      <circle cx="7" cy="7" r="3.5" stroke="currentColor" stroke-width="1.5" />
      <path d="M10 10l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M5.5 7h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'zoom-in'">
      <circle cx="7" cy="7" r="3.5" stroke="currentColor" stroke-width="1.5" />
      <path d="M10 10l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M7 5.5v3M5.5 7h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'maximize'">
      <path d="M8 8 3.2 3.2M8 8l4.8-4.8M8 8l-4.8 4.8M8 8l4.8 4.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M5.4 3.2H3.2v2.2M10.6 3.2h2.2v2.2M5.4 12.8H3.2v-2.2M10.6 12.8h2.2v-2.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <template v-else-if="name === 'warning'">
      <path d="M8 2.3 13.3 12H2.7L8 2.3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M8 5.6v3.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <circle cx="8" cy="10.9" r="0.7" fill="currentColor" />
    </template>

    <template v-else-if="name === 'loading'">
      <g class="icon-spin">
        <path d="M8 2.1a5.9 5.9 0 1 1-4.17 1.73" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity="0.25" />
        <path d="M3.83 3.83A5.9 5.9 0 0 1 8 2.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </g>
    </template>

    <template v-else-if="name === 'crashed'">
      <path d="M8.8 1.8 4.5 8h2.7L6.8 14.2l4.7-6.6H8.7l.1-5.8Z" fill="currentColor" />
    </template>

    <template v-else-if="name === 'unresponsive'">
      <circle cx="8" cy="8" r="5.7" stroke="currentColor" stroke-width="1.5" />
      <path d="M6.3 5.5v5M9.7 5.5v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'trash'">
      <path d="M3.5 4.2h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M5.2 4.2V13h5.6V4.2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M6.2 4.2V3.1h3.6v1.1" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="M6.9 6.3v4.9M9.1 6.3v4.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'edit'">
      <path d="m10.9 2.6 2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="M3.2 12.8 4 9.9l6.9-6.9 2.5 2.5-6.9 6.9-3.3.4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
    </template>

    <template v-else-if="name === 'arrow-up'">
      <path d="M8 12.8V3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="m4.8 6.7 3.2-3.2 3.2 3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <template v-else-if="name === 'arrow-down'">
      <path d="M8 3.2v9.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="m4.8 9.3 3.2 3.2 3.2-3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <template v-else-if="name === 'clear-data'">
      <path d="M6.1 3.3h6.6a1.3 1.3 0 0 1 1.3 1.3v6.8a1.3 1.3 0 0 1-1.3 1.3H6.1L2 8l4.1-4.7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
      <path d="m8 6.1 3 3M11 6.1 8 9.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'plus'">
      <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'import'">
      <path d="M8 2.8v6.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="m5.3 6.7 2.7 2.7 2.7-2.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M3 12.3h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'export'">
      <path d="M8 9.2V2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      <path d="m5.3 5.3 2.7-2.7 2.7 2.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M3 12.3h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'check'">
      <path d="m3.4 8.1 2.8 2.8 6.4-6.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </template>

    <template v-else-if="name === 'monitor'">
      <rect x="2.2" y="3.1" width="11.6" height="7.8" rx="1.5" stroke="currentColor" stroke-width="1.5" />
      <path d="M6.2 12.9h3.6M8 10.9v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'x-circle'">
      <circle cx="8" cy="8" r="5.7" stroke="currentColor" stroke-width="1.5" />
      <path d="M5.7 5.7 10.3 10.3M10.3 5.7l-4.6 4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </template>

    <template v-else-if="name === 'check-circle'">
      <circle cx="8" cy="8" r="5.7" stroke="currentColor" stroke-width="1.5" />
      <path d="m5.2 8.1 1.8 1.8 3.8-3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </template>
  </svg>
</template>

<style>
.app-icon { display: inline-block; vertical-align: middle; flex-shrink: 0; }
.icon-spin { transform-origin: 8px 8px; animation: icon-spin 0.8s linear infinite; }
@keyframes icon-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .icon-spin { animation: none !important; } }
</style>
