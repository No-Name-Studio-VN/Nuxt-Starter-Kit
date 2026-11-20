<script setup lang="ts">
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';

defineProps<{
  title: string;
  description?: string;
  dimmed?: boolean;
}>();
</script>

<template>
  <Item
    role="listitem"
    class="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-none border-x-0 border-t-0 border-b-0 px-5 py-3.5 motion-reduce:transition-none @min-[28rem]/security:grid-cols-[2rem_minmax(0,1fr)_auto]"
  >
    <ItemMedia
      variant="icon"
      class="rounded-md border-0 group-has-data-[slot=item-description]/item:self-center group-has-data-[slot=item-description]/item:translate-y-0"
      :class="{ 'text-muted-foreground': dimmed }"
    >
      <slot name="icon" />
    </ItemMedia>
    <ItemContent class="min-w-0 gap-0.5">
      <ItemTitle class="wrap-anywhere" :class="{ 'text-muted-foreground': dimmed }">{{ title }}</ItemTitle>
      <ItemDescription v-if="description" class="line-clamp-none text-[13px] wrap-anywhere text-pretty">
        {{ description }}
      </ItemDescription>
      <slot name="extra" />
    </ItemContent>
    <ItemActions
      v-if="$slots.actions"
      class="col-start-2 max-w-full flex-wrap @min-[28rem]/security:col-start-3 @min-[28rem]/security:row-start-1 @min-[28rem]/security:justify-end pointer-coarse:[&>button]:min-h-11 pointer-coarse:[&>button]:min-w-11 motion-reduce:[&>button]:transition-none"
    >
      <slot name="actions" />
    </ItemActions>
  </Item>
</template>
