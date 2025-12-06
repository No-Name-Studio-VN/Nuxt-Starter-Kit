<template>
  <AppLayout>
    <Tabs default-value="users">
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="users">
          Users Management
        </TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <AdminUsersManager />
      </TabsContent>
    </Tabs>

    <AlertDialog>
      <AlertDialogTrigger as-child>
        <Button variant="destructive">
          Clear Server Cache
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
          <AlertDialogAction @click="clearServerCache">
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </AppLayout>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
import AdminUsersManager from '@/components/admin/AdminUsersManager.vue'
import { toast } from 'vue-sonner'

definePageMeta({
  title: 'Admin Dashboard',
  breadcrumb: 'Admin',
  layout: 'dashboard',
})

const clearServerCache = () => {
  $fetch('/api/admin/clear-server-cache').then(() => {
    toast.success('Server cache cleared successfully.')
  }).catch(() => {
    toast.error('Failed to clear server cache.')
  })
}
</script>
