<script setup lang="ts">
import { Badge } from '@/components/ui/badge';

const props = defineProps<{ positive?: boolean }>();
</script>

<template>
  <Badge
    variant="outline"
    class="gap-1.5 rounded-full motion-reduce:transition-none"
    :class="props.positive
      ? 'border-green-700/35 bg-green-100 text-green-800 dark:border-green-400/35 dark:bg-green-950 dark:text-green-400'
      : 'text-muted-foreground'"
  >
    <span aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-current" />
    <slot />
  </Badge>
</template>
