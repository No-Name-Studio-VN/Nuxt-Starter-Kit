<script setup lang="ts">
import { ChevronRightIcon } from '@lucide/vue';

defineProps<{ disabled: boolean; title: string; description: string }>();
defineEmits<{ select: [] }>();
</script>

<template>
  <Button
    type="button"
    variant="outline"
    class="h-auto min-h-17 w-full justify-start gap-3 px-3 py-3 text-start whitespace-normal"
    :disabled="disabled"
    @click="$emit('select')"
  >
    <span class="grid size-9 shrink-0 place-items-center rounded-md border bg-muted/55" aria-hidden="true">
      <slot />
    </span>
    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span>{{ title }}</span>
      <span class="text-xs leading-relaxed font-normal text-muted-foreground">{{ description }}</span>
    </span>
    <ChevronRightIcon data-icon="inline-end" class="text-muted-foreground" aria-hidden="true" />
  </Button>
</template>
