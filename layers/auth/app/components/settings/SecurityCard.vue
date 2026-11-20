<script setup lang="ts">
import { Card, CardAction, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { ItemGroup } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import SecurityStatusPill from '#layers/auth/app/components/settings/SecurityStatusPill.vue';

defineProps<{
  title: string;
  description: string;
  status: string;
  positive?: boolean;
}>();
</script>

<template>
  <Card class="@container/security min-w-0 gap-0 bg-card py-0 shadow-none">
    <CardHeader class="grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-5 pt-4.5 pb-3.5 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
      <h2 class="text-[15px] leading-snug font-semibold">
        <slot name="title">{{ title }}</slot>
      </h2>
      <CardDescription class="text-[13px]">{{ description }}</CardDescription>
      <CardAction class="mt-0.5">
        <SecurityStatusPill :positive="positive">{{ status }}</SecurityStatusPill>
      </CardAction>
    </CardHeader>
    <Separator />
    <CardContent class="px-0">
      <slot name="before" />
      <ItemGroup v-if="$slots.default" class="[&>[role=listitem]+[role=listitem]]:border-t [&>[role=listitem]+[role=listitem]]:border-t-border">
        <slot />
      </ItemGroup>
    </CardContent>
  </Card>
</template>
