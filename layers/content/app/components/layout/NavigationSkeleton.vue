<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';

defineProps<{ label: string }>();

const widths = ['w-4/5', 'w-3/5', 'w-5/6', 'w-2/3', 'w-3/4', 'w-1/2'];
</script>

<template>
  <div role="status" aria-live="polite" :aria-label="label" class="flex flex-col gap-3 py-1">
    <span class="sr-only">{{ label }}</span>
    <div aria-hidden="true" class="flex flex-col gap-3">
      <Skeleton
        v-for="(width, index) in widths"
        :key="index"
        class="h-5 motion-reduce:animate-none"
        :class="width"
      />
    </div>
  </div>
</template>
