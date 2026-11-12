<template>
  <div class="space-y-8">
    <!-- Header Section -->
    <div class="space-y-2">
      <h1 class="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
      <p class="text-muted-foreground">
        Manage your application's content, users, and system settings
      </p>
    </div>

    <!-- Main Management Cards -->
    <div class="flex flex-col gap-3">
      <NuxtLink
        v-for="card in managementCards"
        :key="card.id"
        :to="card.to"
        class="group flex items-center gap-4 rounded-md border bg-card p-4 transition-colors hover:border-primary hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div
          :class="[
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            card.bgColor,
            card.textColor,
          ]"
        >
          <component :is="card.icon" class="size-5" />
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-medium text-base truncate">
            {{ card.title }}
          </h3>
          <p class="text-sm text-muted-foreground truncate">
            {{ card.description }}
          </p>
        </div>
        <ChevronRightIcon
          class="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1"
        />
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ChevronRightIcon,
  // <nsk:feature-flags>
  FlagIcon,
  // </nsk:feature-flags>
} from '@lucide/vue';
import type { AdminCardRecord } from '#layers/admin/types/adminCards';

definePageMeta({
  title: 'Admin Dashboard',
  breadcrumb: 'Admin',
  middleware: ['auth', 'admin'],
});

/**
 * Cards whose modules have not registered them yet, in the same records the
 * `adminCards` nav menu holds. They sort in with the registered cards by `order`.
 */
const INLINE_ADMIN_CARDS: AdminCardRecord[] = [
  // <nsk:feature-flags>
  {
    id: 'feature-flags',
    order: 200,
    title: 'Feature Flags',
    description: 'Manage feature flags and rollouts',
    to: '/admin/feature-flags',
    icon: FlagIcon,
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-500',
  },
  // </nsk:feature-flags>
];

const managementCards = computed(() => {
  const registered = getNavItems('adminCards');
  const registeredIds = new Set(registered.map((card) => card.id));
  // A registered card wins over an inline card with the same id.
  const inline = INLINE_ADMIN_CARDS.filter((card) => {
    if (!registeredIds.has(card.id)) {
      return true;
    }
    if (import.meta.dev) {
      console.warn(`[admin] Card "${card.id}" is registered; its inline card is skipped.`);
    }
    return false;
  });

  return [...registered, ...inline].sort((a, b) => a.order - b.order);
});
</script>
