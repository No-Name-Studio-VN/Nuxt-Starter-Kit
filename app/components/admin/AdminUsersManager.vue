<template>
  <div class="space-y-6">
    <!-- Header with Actions -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-2xl font-semibold">
          Users
        </h2>
        <p class="text-sm text-muted-foreground mt-1">
          Manage user accounts and permissions
        </p>
      </div>
      <Button @click="openAddDialog">
        <UserPlus
          class="mr-2 h-4 w-4"
        />
        Add User
      </Button>
    </div>

    <!-- Users DataTable -->
    <DataTable
      ref="dataTableRef"
      :columns="columns"
      :data="users"
      @update:data="fetchUsers"
    />

    <!-- Batch Delete Action -->
    <div
      v-if="selectedUserIds.length > 0"
      class="flex gap-2 p-4 bg-muted rounded-lg border"
    >
      <div class="flex-1 flex items-center gap-2">
        <InfoIcon
          class="h-4 w-4 text-muted-foreground"
        />
        <span class="text-sm text-muted-foreground">
          {{ selectedUserIds.length }} user(s) selected
        </span>
      </div>
      <Button
        variant="destructive"
        :disabled="loading"
        @click="handleBatchDelete"
      >
        <Trash2Icon
          class="mr-2 h-4 w-4"
        />
        Delete Selected
      </Button>
    </div>

    <!-- Add/Edit User Dialog -->
    <Dialog
      v-model:open="showDialog"
    >
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {{ isEditing ? 'Edit User' : 'Add New User' }}
          </DialogTitle>
          <DialogDescription>
            {{ isEditing ? 'Update user information and permissions.' : 'Create a new user account with the details below.' }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Username</label>
            <Input
              v-model="formData.username"
              placeholder="Enter username"
              :disabled="isEditing"
              autocomplete="off"
            />
            <p
              v-if="isEditing"
              class="text-xs text-muted-foreground"
            >
              Username cannot be changed
            </p>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Full Name</label>
            <Input
              v-model="formData.name"
              placeholder="Enter full name"
            />
          </div>

          <div
            v-if="!isEditing"
            class="space-y-2"
          >
            <label class="text-sm font-medium">Password</label>
            <Input
              v-model="formData.password"
              type="password"
              placeholder="Enter password"
              autocomplete="new-password"
            />
          </div>

          <div class="space-y-3 pt-2">
            <div class="flex items-center space-x-2">
              <Switch
                id="admin"
                v-model:model-value="formData.isAdmin"
              />
              <label
                for="admin"
                class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Administrator
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            :disabled="loading"
            @click="closeDialog"
          >
            Cancel
          </Button>
          <Button
            :disabled="loading || !isFormValid"
            @click="handleSave"
          >
            <Loader2Icon
              v-if="loading"
              class="mr-2 h-4 w-4 animate-spin"
            />
            {{ isEditing ? 'Save Changes' : 'Create User' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'vue-sonner'
import DataTable from './users/DataTable.vue'
import { createColumns, type User } from './users/columns'
import { InfoIcon, Loader2Icon, Trash2Icon, UserPlus } from 'lucide-vue-next'

const dataTableRef = ref()
const users = ref<User[]>([])
const loading = ref(false)
const showDialog = ref(false)
const editingUserId = ref<number | null>(null)

const formData = ref({
  username: '',
  name: '',
  password: '',
  isAdmin: false,
})

const isEditing = computed(() => editingUserId.value !== null)

const isFormValid = computed(() => {
  if (isEditing.value) {
    return formData.value.name.trim().length > 0
  }
  return (
    formData.value.username.trim().length > 0
    && formData.value.name.trim().length > 0
    && formData.value.password.trim().length > 0
  )
})

const selectedUserIds = computed(() => {
  if (!dataTableRef.value?.table) return []
  const selectedRows = dataTableRef.value.table.getFilteredSelectedRowModel().rows
  return selectedRows.map((row: { original: User }) => row.original.id)
})

// Create columns with callbacks
const columns = computed(() => createColumns(handleEdit, handleDeleteConfirm))

async function fetchUsers() {
  try {
    loading.value = true
    const data = await $fetch<User[]>('/api/admin/users')
    users.value = data
  }
  catch (error) {
    toast.error('Failed to fetch users')
    console.error(error)
  }
  finally {
    loading.value = false
  }
}

function openAddDialog() {
  editingUserId.value = null
  resetForm()
  showDialog.value = true
}

function handleEdit(user: User) {
  editingUserId.value = user.id
  formData.value = {
    username: user.username,
    name: user.name,
    password: '',
    isAdmin: user.isAdmin,
  }
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
  editingUserId.value = null
  resetForm()
}

function resetForm() {
  formData.value = {
    username: '',
    name: '',
    password: '',
    isAdmin: false,
  }
}

async function handleSave() {
  if (!isFormValid.value) return

  try {
    loading.value = true

    if (isEditing.value) {
      // Update existing user
      await $fetch(`/api/admin/users/${editingUserId.value}`, {
        method: 'PUT',
        body: {
          name: formData.value.name.trim(),
          isAdmin: formData.value.isAdmin,
        },
      })
      toast.success('User updated successfully')
    }
    else {
      // Create new user
      await $fetch('/api/admin/users', {
        method: 'POST',
        body: {
          username: formData.value.username.trim(),
          name: formData.value.name.trim(),
          password: formData.value.password,
          isAdmin: formData.value.isAdmin,
        },
      })
      toast.success('User created successfully')
    }

    closeDialog()
    await fetchUsers()
  }
  catch (error) {
    const message = (error as { data?: { message?: string } })?.data?.message
      || (isEditing.value ? 'Failed to update user' : 'Failed to create user')
    toast.error(message)
    console.error(error)
  }
  finally {
    loading.value = false
  }
}

function handleDeleteConfirm(userId: number) {
  const user = users.value.find(u => u.id === userId)
  if (!user) return

  if (confirm(`Are you sure you want to delete user "${user.username}"? This action cannot be undone.`)) {
    handleDelete(userId)
  }
}

async function handleDelete(userId: number) {
  try {
    loading.value = true
    await $fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    })
    toast.success('User deleted successfully')
    await fetchUsers()
  }
  catch (error) {
    toast.error('Failed to delete user')
    console.error(error)
  }
  finally {
    loading.value = false
  }
}

async function handleBatchDelete() {
  if (selectedUserIds.value.length === 0) return

  const count = selectedUserIds.value.length
  if (!confirm(`Are you sure you want to delete ${count} user(s)? This action cannot be undone.`)) {
    return
  }

  try {
    loading.value = true
    await $fetch('/api/admin/users/delete', {
      method: 'POST',
      body: { userIds: selectedUserIds.value },
    })
    toast.success(`Successfully deleted ${count} user(s)`)

    // Clear selection
    if (dataTableRef.value?.table) {
      dataTableRef.value.table.resetRowSelection()
    }
    await fetchUsers()
  }
  catch (error) {
    toast.error('Failed to delete users')
    console.error(error)
  }
  finally {
    loading.value = false
  }
}

// Fetch users on mount
onMounted(() => {
  fetchUsers()
})
</script>
