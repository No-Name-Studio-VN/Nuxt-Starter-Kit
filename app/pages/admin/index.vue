<template>
  <AppLayout>
    <div class="space-y-8">
      <!-- Header Section -->
      <div class="space-y-2">
        <h1 class="text-3xl font-bold tracking-tight">
          Admin Dashboard
        </h1>
        <p class="text-muted-foreground">
          Manage your application's content, users, and system settings
        </p>
      </div>

      <!-- Main Management Cards -->
      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card
          v-for="card in managementCards"
          :key="card.id"
          class="group cursor-pointer transition-all hover:shadow-lg"
          @click="navigateTo(card.route)"
        >
          <CardHeader>
            <div class="flex items-center justify-between">
              <div :class="['flex size-12 items-center justify-center rounded-lg', card.bgColor, card.textColor]">
                <component
                  :is="card.icon"
                  class="size-6"
                />
              </div>
              <ChevronRightIcon class="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </div>
          </CardHeader>
          <CardContent class="space-y-2">
            <CardTitle>{{ card.title }}</CardTitle>
            <CardDescription>
              {{ card.description }}
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      <!-- System Actions Section -->
      <div class="space-y-4">
        <h2 class="text-xl font-semibold">
          System Actions
        </h2>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle class="flex items-center gap-2 text-base">
                <TrashIcon class="size-4" />
                Clear Server Cache
              </CardTitle>
              <CardDescription>
                Clear all cached data to force fresh data retrieval
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger as-child>
                  <Button
                    variant="destructive"
                    size="sm"
                    class="w-full"
                  >
                    Clear Cache
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will clear the server cache. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      @click="clearServerCache"
                    >
                      Confirm
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'vue-sonner'
import {
  UsersIcon,
  TicketIcon,
  HardDriveIcon,
  AlertTriangleIcon,
  BookOpenIcon,
  ChevronRightIcon,
  TrashIcon,
} from 'lucide-vue-next'
import type { Component } from 'vue'

definePageMeta({
  title: 'Admin Dashboard',
  breadcrumb: 'Admin',
  middleware: ['auth', 'admin'],
})

interface ManagementCard {
  id: string
  icon: Component
  title: string
  description: string
  route: string
  bgColor: string
  textColor: string
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
    id: 'subscriptions',
    icon: TicketIcon,
    title: 'Subscriptions',
    description: 'Manage user subscriptions, plans, and billing information',
    route: '/admin/subscriptions',
    bgColor: 'bg-teal-500/10',
    textColor: 'text-teal-500',
  },
]

const clearServerCache = () => {
  $fetch('/api/admin/clear-server-cache').then(() => {
    toast.success('Server cache cleared successfully.')
  }).catch(() => {
    toast.error('Failed to clear server cache.')
  })
}
</script>
