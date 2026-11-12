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
import { ChevronRightIcon } from '@lucide/vue';

definePageMeta({
  title: 'Admin Dashboard',
  breadcrumb: 'Admin',
  middleware: ['auth', 'admin'],
});

const managementCards = computed(() => getNavItems('adminCards'));
</script>
