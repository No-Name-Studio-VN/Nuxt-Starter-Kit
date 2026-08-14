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
        :to="card.route"
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
  UsersIcon,
  TicketIcon,
  HardDriveIcon,
  AlertTriangleIcon,
  BookOpenIcon,
  ChevronRightIcon,
  PenToolIcon,
  UploadCloudIcon,
  FlagIcon,
  DatabaseIcon,
} from '@lucide/vue';
import type { Component } from 'vue';

definePageMeta({
  title: 'Admin Dashboard',
  breadcrumb: 'Admin',
  middleware: ['auth', 'admin'],
});

interface ManagementCard {
  id: string;
  icon: Component;
  title: string;
  description: string;
  route: string;
  bgColor: string;
  textColor: string;
}

const managementCards: ManagementCard[] = [
  {
    id: 'users',
    icon: UsersIcon,
    title: 'Users Management',
    description: 'View, edit, and manage user accounts, roles, and permissions',
    route: '/admin/users',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-500',
  },
  {
    id: 'coupons',
    icon: TicketIcon,
    title: 'Coupons',
    description: 'Create, manage, and track promotional coupons and discount codes',
    route: '/admin/coupons',
    bgColor: 'bg-green-500/10',
    textColor: 'text-green-500',
  },
  {
    id: 'drives',
    icon: HardDriveIcon,
    title: 'Drives',
    description: 'Configure and monitor connected storage drives and file systems',
    route: '/admin/drives',
    bgColor: 'bg-purple-500/10',
    textColor: 'text-purple-500',
  },
  {
    id: 'removal-requests',
    icon: AlertTriangleIcon,
    title: 'Removal Requests',
    description: 'Review and process content removal and deletion requests',
    route: '/admin/removal-requests',
    bgColor: 'bg-orange-500/10',
    textColor: 'text-orange-500',
  },
  {
    id: 'stories',
    icon: BookOpenIcon,
    title: 'Stories',
    description: 'Browse and manage all stories in the library',
    route: '/admin/stories',
    bgColor: 'bg-pink-500/10',
    textColor: 'text-pink-500',
  },
  {
    id: 'community',
    icon: PenToolIcon,
    title: 'Community Stories',
    description: 'Review, approve, or reject community-submitted stories',
    route: '/admin/community',
    bgColor: 'bg-indigo-500/10',
    textColor: 'text-indigo-500',
  },
  {
    id: 'community-imports',
    icon: UploadCloudIcon,
    title: 'Manga Imports',
    description: 'Queue crawler folders and build draft manga chapters',
    route: '/admin/community/imports',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-500',
  },
  {
    id: 'subscriptions',
    icon: TicketIcon,
    title: 'Subscriptions',
    description: 'Manage user subscriptions, plans, and billing information',
    route: '/admin/subscriptions',
    bgColor: 'bg-teal-500/10',
    textColor: 'text-teal-500',
  },
  {
    id: 'feature-flags',
    icon: FlagIcon,
    title: 'Feature Flags',
    description: 'Manage feature flags and rollouts',
    route: '/admin/feature-flags',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-500',
  },
  {
    id: 'kv',
    icon: DatabaseIcon,
    title: 'KV Store',
    description: 'Browse and manage KV keys, values, and cache clearing controls',
    route: '/admin/kv',
    bgColor: 'bg-slate-500/10',
    textColor: 'text-slate-500',
  },
];
</script>
