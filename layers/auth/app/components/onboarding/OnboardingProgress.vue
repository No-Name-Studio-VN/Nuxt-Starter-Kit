<script setup lang="ts">
defineProps<{ current: number; total: number }>();

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="flex min-h-8 items-center justify-between gap-3">
      <p class="text-xs font-medium tabular-nums text-muted-foreground" aria-live="polite" aria-atomic="true">
        {{ t('onboarding.progress', { current, total }) }}
      </p>
      <slot />
    </div>
    <div class="flex gap-1.5" aria-hidden="true">
      <span
        v-for="segment in total"
        :key="segment"
        class="h-1 flex-1 rounded-full motion-safe:transition-colors"
        :class="{ 'bg-primary': segment <= current, 'bg-muted': segment > current }"
      />
    </div>
  </div>
</template>
