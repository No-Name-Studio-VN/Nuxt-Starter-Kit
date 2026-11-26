<template>
  <div class="space-y-6">
    <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="space-y-1">
        <h2 class="text-2xl font-semibold text-foreground">{{ $t('admin.users.heading') }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ $t('admin.users.summary') }}
        </p>
      </div>

      <Button v-if="canSetPasswords" @click="openAddDialog">
        <UserPlus class="size-4" />
        {{ $t('admin.users.add') }}
      </Button>
    </section>

    <DataTable
      ref="dataTableRef"
      :columns="columns"
      :data="users"
      :loading="loading"
      :column-labels="columnLabels"
      :search-placeholder="$t('admin.users.search')"
      :empty-title="$t('admin.users.empty_title')"
      :empty-description="$t('admin.users.empty_description')"
      @update:data="fetchUsers"
    />

    <div v-if="selectedUserIds.length > 0" class="flex gap-2 p-4 bg-muted rounded-lg border">
      <div class="flex-1 flex items-center gap-2">
        <InfoIcon class="size-4 text-muted-foreground" />
        <span class="text-sm text-muted-foreground">
          {{ t('admin.users.selected', selectedUserIds.length) }}
        </span>
      </div>
      <Button variant="destructive" :disabled="loading" @click="openBatchDeleteDialog">
        <Trash2Icon class="size-4" />
        {{ $t('admin.users.delete_selected') }}
      </Button>
    </div>

    <AlertDialog v-model:open="singleDeleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ $t('admin.users.delete_title') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('admin.users.delete_description', { username: userToDelete?.username }) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="closeSingleDeleteDialog">
            {{ $t('common.cancel') }}
          </AlertDialogCancel>
          <AlertDialogAction :disabled="loading" @click="confirmSingleDelete">
            {{ $t('common.delete') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog v-model:open="batchDeleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ $t('admin.users.delete_selected_title') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('admin.users.delete_selected_description', selectedUserIds.length) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel> {{ $t('common.cancel') }} </AlertDialogCancel>
          <AlertDialogAction
            :disabled="loading || selectedUserIds.length === 0"
            @click="confirmBatchDelete"
          >
            {{ $t('admin.users.delete_selected') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog v-model:open="showDialog">
      <DialogScrollContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {{ t(isEditing ? 'admin.users.edit' : 'admin.users.add') }}
          </DialogTitle>
          <DialogDescription> {{ $t('admin.users.form_description') }} </DialogDescription>
        </DialogHeader>

        <form class="space-y-6" @submit.prevent="onSubmit">
          <FieldGroup>
            <FieldSet>
              <FieldLegend>{{ $t('admin.users.basic_info') }}</FieldLegend>
              <FieldGroup>
                <VeeField v-slot="{ field, errors }" name="username">
                  <Field :data-invalid="!!errors.length">
                    <FieldLabel for="admin-user-username">
                      {{ $t('account_page.username') }}
                    </FieldLabel>
                    <Input
                      id="admin-user-username"
                      :placeholder="$t('auth.username_placeholder')"
                      :disabled="isEditing"
                      autocomplete="off"
                      :aria-invalid="!!errors.length"
                      :model-value="field.value"
                      @update:model-value="field.onChange"
                    />
                    <FieldDescription v-if="isEditing">
                      {{ $t('admin.users.username_fixed') }}
                    </FieldDescription>
                    <FieldError
                      v-if="errors.length"
                      :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                    />
                  </Field>
                </VeeField>

                <VeeField v-slot="{ field, errors }" name="name">
                  <Field :data-invalid="!!errors.length">
                    <FieldLabel for="admin-user-name">
                      {{ $t('account_page.full_name') }}
                    </FieldLabel>
                    <Input
                      id="admin-user-name"
                      :model-value="field.value"
                      :placeholder="$t('admin.users.name_placeholder')"
                      :aria-invalid="!!errors.length"
                      @update:model-value="field.onChange"
                    />
                    <FieldError
                      v-if="errors.length"
                      :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                    />
                  </Field>
                </VeeField>

                <VeeField v-slot="{ field, errors }" name="email">
                  <Field :data-invalid="!!errors.length">
                    <FieldLabel for="admin-user-email"> {{ $t('common.email') }} </FieldLabel>
                    <Input
                      id="admin-user-email"
                      :model-value="field.value"
                      type="email"
                      :placeholder="$t('admin.users.email_placeholder')"
                      :aria-invalid="!!errors.length"
                      @update:model-value="field.onChange"
                    />
                    <FieldError
                      v-if="errors.length"
                      :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                    />
                  </Field>
                </VeeField>

                <VeeField v-if="canSetPasswords" v-slot="{ field, errors }" name="password">
                  <Field :data-invalid="!!errors.length">
                    <FieldLabel for="admin-user-password">
                      {{ $t('admin.users.password') }}
                    </FieldLabel>
                    <Input
                      id="admin-user-password"
                      :model-value="field.value"
                      type="password"
                      :placeholder="
                        t(
                          isEditing
                            ? 'admin.users.password_keep'
                            : 'admin.users.password_placeholder',
                        )
                      "
                      autocomplete="new-password"
                      :aria-invalid="!!errors.length"
                      @update:model-value="field.onChange"
                    />
                    <FieldDescription v-if="isEditing">
                      {{ $t('admin.users.password_change_hint') }}
                    </FieldDescription>
                    <FieldError
                      v-if="errors.length"
                      :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                    />
                  </Field>
                </VeeField>
              </FieldGroup>
            </FieldSet>

            <FieldSeparator />

            <FieldSet>
              <FieldLegend>{{ $t('settings.breadcrumb') }}</FieldLegend>
              <FieldGroup>
                <VeeField v-slot="{ field, errors }" name="isAdmin">
                  <Field orientation="horizontal" :data-invalid="!!errors.length">
                    <FieldContent>
                      <FieldLabel for="admin-user-is-admin">
                        {{ $t('admin.users.administrator') }}
                      </FieldLabel>
                      <FieldDescription>
                        {{ $t('admin.users.administrator_hint') }}
                      </FieldDescription>
                      <FieldError
                        v-if="errors.length"
                        :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                      />
                    </FieldContent>
                    <Switch
                      id="admin-user-is-admin"
                      :model-value="field.value"
                      :aria-invalid="!!errors.length"
                      @update:model-value="field.onChange"
                    />
                  </Field>
                </VeeField>

                <VeeField v-if="isEditing" v-slot="{ field, errors }" name="emailVerified">
                  <Field orientation="horizontal" :data-invalid="!!errors.length">
                    <FieldContent>
                      <FieldLabel for="admin-user-email-verified">
                        {{ $t('admin.users.email_verified') }}
                      </FieldLabel>
                      <FieldDescription>
                        {{ $t('admin.users.email_verified_hint') }}
                      </FieldDescription>
                      <FieldError
                        v-if="errors.length"
                        :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                      />
                    </FieldContent>
                    <Switch
                      id="admin-user-email-verified"
                      :model-value="field.value"
                      :aria-invalid="!!errors.length"
                      @update:model-value="field.onChange"
                    />
                  </Field>
                </VeeField>
              </FieldGroup>
            </FieldSet>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" type="button" :disabled="loading" @click="closeDialog">
              {{ $t('common.cancel') }}
            </Button>
            <Button type="submit" :is-loading="loading">
              {{ t(isEditing ? 'admin.users.save' : 'admin.users.create') }}
            </Button>
          </DialogFooter>
        </form>
      </DialogScrollContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import '#layers/auth/types/extensions';
import { computed, onMounted, ref } from 'vue';
import { Field as VeeField, useForm } from 'vee-validate';
import { toast } from 'vue-sonner';
import {
  adminUserCreateFormSchema,
  adminUserEditFormSchema,
} from '#layers/admin-users/shared/schemas/adminUserSchema';
import type {
  AdminUserCreateFormInput,
  AdminUserEditFormInput,
} from '#layers/admin-users/shared/schemas/adminUserSchema';
import type { SafeUser } from '#layers/auth/types/auth';
import type { AdminUserModel } from '#layers/admin-users/types/adminUsers';
import { adminUserRoutes } from '#layers/admin-users/shared/adminUserRoutes';
import type { ApiResponse } from '#layers/server-core/types/api';
import { InfoIcon, Trash2Icon, UserPlus } from '@lucide/vue';
import DataTable from '@/components/DataTable.vue';
import { createColumns } from './columns';
import { parseApiError } from '#layers/server-core/app/utils/apiError';

type UserFormValues = AdminUserCreateFormInput &
  Pick<AdminUserEditFormInput, 'id' | 'emailVerified'>;

interface TableRowWithOriginal {
  original: SafeUser;
}

const dataTableRef = ref<{
  table?: {
    getFilteredSelectedRowModel: () => { rows: TableRowWithOriginal[] };
    resetRowSelection: () => void;
  };
}>();
const { t, te, locale } = useI18n();
const users = ref<SafeUser[]>([]);
const loading = ref(false);
const showDialog = ref(false);
const editingUserId = ref<number | null>(null);
const singleDeleteDialogOpen = ref(false);
const batchDeleteDialogOpen = ref(false);
const deleteUserId = ref<number | null>(null);

const defaultFormData: UserFormValues = {
  id: 0,
  username: '',
  email: '',
  name: '',
  password: '',
  emailVerified: false,
  isAdmin: false,
};

// Passwords exist only when password sign-in is installed; it registers the `password` login method.
const canSetPasswords = getExtensions('auth:login:methods').some(
  (entry) => entry.id === 'password',
);
const isEditing = computed(() => editingUserId.value !== null);
const validationSchema = computed(() =>
  isEditing.value ? adminUserEditFormSchema : adminUserCreateFormSchema,
);

const { handleSubmit, resetForm, setFieldError } = useForm<UserFormValues>({
  initialValues: { ...defaultFormData },
  validationSchema,
});

const onSubmit = handleSubmit(async (values) => {
  try {
    loading.value = true;

    if (isEditing.value && editingUserId.value !== null) {
      const payload: AdminUserEditFormInput = {
        id: editingUserId.value,
        username: values.username,
        email: values.email,
        name: values.name,
        // The endpoint ignores a blank password, so there is nothing to strip here.
        password: values.password,
        emailVerified: values.emailVerified,
        isAdmin: values.isAdmin,
      };

      const response = await apiRequest<ApiResponse<{ user: AdminUserModel }>>(
        adminUserRoutes.adminUser(editingUserId.value),
        {
          method: 'PUT',
          body: payload,
        },
      );

      if (!response.success) {
        throw response;
      }
    } else {
      const payload: AdminUserCreateFormInput = {
        username: values.username,
        email: values.email,
        name: values.name,
        password: values.password,
        isAdmin: values.isAdmin,
      };

      const response = await apiRequest<ApiResponse<AdminUserModel>>(adminUserRoutes.ADMIN_USERS, {
        method: 'POST',
        body: payload,
      });

      if (!response.success) {
        throw response;
      }
    }

    toast.success(t(isEditing.value ? 'admin.users.updated' : 'admin.users.created'));
    closeDialog();
    await fetchUsers();
  } catch (error) {
    const { fieldErrors } = parseApiError(error);
    let hasFieldError = false;
    const fields: (keyof UserFormValues)[] = [
      'username',
      'name',
      'email',
      'password',
      'isAdmin',
      'emailVerified',
    ];
    for (const field of fields) {
      const key = fieldErrors[field]?.[0];
      if (key) {
        setFieldError(field, te(key) ? key : 'errors.invalid_field');
        hasFieldError = true;
      }
    }
    if (!hasFieldError) toast.error(t('admin.users.save_failed'));
  } finally {
    loading.value = false;
  }
});

const selectedUserIds = computed(() => {
  if (!dataTableRef.value?.table) {
    return [];
  }

  const selectedRows = dataTableRef.value.table.getFilteredSelectedRowModel().rows;
  return selectedRows.map((row) => row.original.id);
});

const userToDelete = computed(() => {
  if (deleteUserId.value === null) {
    return null;
  }

  return users.value.find((user) => user.id === deleteUserId.value) ?? null;
});

const columns = computed(() => createColumns(t, locale.value, handleEdit, handleDeleteConfirm));
const columnLabels = computed(() => ({
  username: t('account_page.username'),
  name: t('account_page.full_name'),
  email: t('common.email'),
  isAdmin: t('admin.users.roles'),
  emailVerified: t('admin.users.email_verification'),
  createdAt: t('admin.users.created_at'),
  lastLoginAt: t('admin.users.last_login'),
}));

async function fetchUsers() {
  try {
    loading.value = true;
    const res = await apiRequest<ApiResponse<SafeUser[]>>(adminUserRoutes.ADMIN_USERS);
    if (res.success && res.data) {
      users.value = res.data;
    } else {
      throw res;
    }
  } catch {
    toast.error(t('admin.users.load_failed'));
  } finally {
    loading.value = false;
  }
}

function resetToDefaults() {
  resetForm({ values: { ...defaultFormData } });
}

function openAddDialog() {
  editingUserId.value = null;
  resetToDefaults();
  showDialog.value = true;
}

function handleEdit(user: SafeUser) {
  editingUserId.value = user.id;
  resetForm({
    values: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      password: '',
      emailVerified: user.emailVerified,
      isAdmin: user.isAdmin,
    },
  });
  showDialog.value = true;
}

function closeDialog() {
  showDialog.value = false;
  editingUserId.value = null;
  resetToDefaults();
}

function handleDeleteConfirm(userId: number) {
  const user = users.value.find((candidate) => candidate.id === userId);
  if (!user) {
    return;
  }

  deleteUserId.value = userId;
  singleDeleteDialogOpen.value = true;
}

function closeSingleDeleteDialog() {
  singleDeleteDialogOpen.value = false;
  deleteUserId.value = null;
}

async function confirmSingleDelete() {
  if (deleteUserId.value === null) {
    return;
  }

  const userId = deleteUserId.value;
  closeSingleDeleteDialog();
  await handleDelete(userId);
}

async function handleDelete(userId: number) {
  try {
    loading.value = true;
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      adminUserRoutes.adminUser(userId),
      {
        method: 'DELETE',
      },
    );
    if (!response.success) {
      throw response;
    }
    toast.success(t('admin.users.deleted'));
    await fetchUsers();
  } catch {
    toast.error(t('admin.users.delete_failed'));
  } finally {
    loading.value = false;
  }
}

async function handleBatchDelete() {
  if (selectedUserIds.value.length === 0) {
    return;
  }

  try {
    loading.value = true;
    const count = selectedUserIds.value.length;
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      adminUserRoutes.ADMIN_USERS_DELETE,
      {
        method: 'POST',
        body: { userIds: selectedUserIds.value },
      },
    );
    if (!response.success) {
      throw response;
    }
    toast.success(t('admin.users.deleted_many', count));

    dataTableRef.value?.table?.resetRowSelection();
    await fetchUsers();
  } catch {
    toast.error(t('admin.users.delete_many_failed'));
  } finally {
    loading.value = false;
  }
}

function openBatchDeleteDialog() {
  if (selectedUserIds.value.length === 0) {
    return;
  }

  batchDeleteDialogOpen.value = true;
}

async function confirmBatchDelete() {
  batchDeleteDialogOpen.value = false;
  await handleBatchDelete();
}

onMounted(() => {
  fetchUsers();
});
</script>
