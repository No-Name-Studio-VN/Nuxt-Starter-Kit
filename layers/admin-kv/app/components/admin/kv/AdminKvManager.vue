<template>
  <div class="flex flex-col gap-6">
    <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-semibold text-foreground">{{ $t('admin.kv.title') }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ $t('admin.kv.description') }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <AlertDialog v-model:open="clearDialogOpen">
          <AlertDialogTrigger as-child>
            <Button variant="outline">
              <Trash2Icon data-icon="inline-start" />
              {{ $t('admin.kv.clear') }}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{{ $t('admin.kv.clear_title') }}</AlertDialogTitle>
              <AlertDialogDescription>
                {{ $t('admin.kv.clear_description') }}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                :disabled="clearing"
                @click="clearKvAndCache"
              >
                {{ $t('admin.kv.clear') }}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button @click="openCreateDialog">
          <PlusIcon data-icon="inline-start" />
          {{ $t('admin.kv.add') }}
        </Button>
      </div>
    </section>

    <AlertBox variant="warning">
      <AlertTriangleIcon class="size-4 shrink-0" />
      <AlertBoxContent>
        <AlertBoxTitle>{{ $t('admin.kv.access_title') }}</AlertBoxTitle>
        <AlertBoxDescription>
          {{ $t('admin.kv.access_description') }}
        </AlertBoxDescription>
      </AlertBoxContent>
    </AlertBox>

    <DataTable
      ref="dataTableRef"
      :columns="columns"
      :data="tableRows"
      :loading="loading || valuesLoading"
      :search-placeholder="$t('admin.kv.search')"
      :empty-title="$t('admin.kv.empty_title')"
      :empty-description="$t('admin.kv.empty_description')"
      :column-labels="columnLabels"
      @update:data="reloadKv"
      @update:visible-data="handleVisibleRows"
    >
      <template #toolbar-actions>
        <Badge variant="secondary"> {{ t('admin.kv.count', keys.length) }} </Badge>
      </template>
      <template #footer-leading>
        <span v-if="valuesLoading">{{ $t('admin.kv.loading') }} </span>
      </template>
    </DataTable>

    <div
      v-if="selectedKeys.length > 0"
      class="flex flex-col gap-3 rounded-lg border bg-muted p-4 sm:flex-row sm:items-center"
    >
      <div class="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
        <InfoIcon class="size-4" />
        <span>{{ t('admin.kv.selected', selectedKeys.length) }}</span>
      </div>
      <Button variant="destructive" :disabled="deleting" @click="openBulkDeleteDialog">
        <Trash2Icon data-icon="inline-start" />
        {{ $t('admin.kv.delete_selected') }}
      </Button>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogScrollContent class="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{{ t(isEditing ? 'admin.kv.edit' : 'admin.kv.create') }}</DialogTitle>
          <DialogDescription>
            {{ t(isEditing ? 'admin.kv.edit_description' : 'admin.kv.create_description') }}
          </DialogDescription>
        </DialogHeader>

        <AlertBox v-if="editingTemporaryReason" variant="warning">
          <AlertTriangleIcon class="size-4 shrink-0" />
          <AlertBoxContent>
            <AlertBoxTitle>{{ $t('admin.kv.temporary_title') }}</AlertBoxTitle>
            <AlertBoxDescription>
              {{ t(editingTemporaryReason) }} {{ t('admin.kv.temporary_expiration') }}
            </AlertBoxDescription>
          </AlertBoxContent>
        </AlertBox>

        <form class="flex flex-col gap-6" @submit.prevent="onSubmit">
          <FieldGroup>
            <VeeField v-slot="{ field, errors }" name="key">
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="admin-kv-key"> {{ $t('admin.kv.key') }} </FieldLabel>
                <Input
                  id="admin-kv-key"
                  :model-value="field.value"
                  class="font-mono"
                  placeholder="feature_flags:config"
                  :disabled="isEditing || saving"
                  :aria-invalid="!!errors.length"
                  @update:model-value="field.onChange"
                />
                <FieldDescription>
                  {{ $t('admin.kv.key_hint') }}
                </FieldDescription>
                <FieldError
                  v-if="errors.length"
                  :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                />
              </Field>
            </VeeField>

            <VeeField v-slot="{ field, errors }" name="mode">
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="admin-kv-mode"> {{ $t('admin.kv.mode') }} </FieldLabel>
                <Select
                  :model-value="String(field.value ?? 'raw')"
                  :disabled="saving"
                  @update:model-value="field.onChange"
                >
                  <SelectTrigger
                    id="admin-kv-mode"
                    class="w-full sm:w-56"
                    :aria-invalid="!!errors.length"
                  >
                    <SelectValue :placeholder="$t('admin.kv.mode_select')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="raw"> {{ $t('admin.kv.mode_raw') }} </SelectItem>
                      <SelectItem value="json"> {{ $t('admin.kv.mode_json') }} </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {{ $t('admin.kv.mode_hint') }}
                </FieldDescription>
                <FieldError
                  v-if="errors.length"
                  :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                />
              </Field>
            </VeeField>

            <VeeField v-slot="{ field, errors }" name="value">
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="admin-kv-value"> {{ $t('admin.kv.value') }} </FieldLabel>
                <AdminKvValueEditor
                  id="admin-kv-value"
                  :model-value="String(field.value ?? '')"
                  :mode="currentMode"
                  :disabled="saving"
                  @update:model-value="field.onChange"
                />
                <FieldDescription>
                  {{ $t('admin.kv.value_hint') }}
                </FieldDescription>
                <FieldError
                  v-if="errors.length"
                  :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                />
              </Field>
            </VeeField>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" :disabled="saving" @click="closeDialog">
              {{ $t('common.cancel') }}
            </Button>
            <Button type="submit" :is-loading="saving">
              {{ t(isEditing ? 'admin.kv.save_value' : 'admin.kv.create_key') }}
            </Button>
          </DialogFooter>
        </form>
      </DialogScrollContent>
    </Dialog>

    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('admin.kv.delete_title', keysToDelete.length) }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('admin.kv.delete_description', keysToDelete.length) }}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertBox v-if="keysToDeleteIncludeTemporary" variant="warning">
          <AlertTriangleIcon class="size-4 shrink-0" />
          <AlertBoxContent>
            <AlertBoxTitle>{{ $t('admin.kv.temporary_selection') }}</AlertBoxTitle>
            <AlertBoxDescription>
              {{ $t('admin.kv.temporary_delete_hint') }}
            </AlertBoxDescription>
          </AlertBoxContent>
        </AlertBox>

        <div class="max-h-44 overflow-auto rounded-md border bg-muted/40 p-3">
          <ul class="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
            <li v-for="key in keysToDelete" :key="key" class="break-all">
              {{ key }}
            </li>
          </ul>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting"> {{ $t('common.cancel') }} </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            :disabled="deleting || keysToDelete.length === 0"
            @click="confirmDelete"
          >
            {{ t('admin.kv.delete_action', keysToDelete.length) }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Field as VeeField, useForm } from 'vee-validate';
import { toast } from 'vue-sonner';
import { AlertTriangleIcon, InfoIcon, PlusIcon, Trash2Icon } from '@lucide/vue';
import { adminKvMutationSchema } from '#layers/admin-kv/shared/schemas/adminKvSchema';
import type {
  AdminKvMutationInput,
  AdminKvValueMode,
} from '#layers/admin-kv/shared/schemas/adminKvSchema';
import { adminKvRoutes } from '#layers/admin-kv/shared/adminKvRoutes';
import type { ApiResponse, ParsedApiError } from '#layers/server-core/types/api';
import type {
  AdminKvDeletePayload,
  AdminKvKeysPayload,
  AdminKvValuePayload,
  AdminKvValuesResponsePayload,
  ClearedPayload,
} from '#layers/admin-kv/types/adminKv';
import DataTable from '@/components/DataTable.vue';
import AdminKvValueEditor from './AdminKvValueEditor.client.vue';
import { createColumns } from './columns';
import type { AdminKvTableRow } from './types';
import { parseApiError } from '#layers/server-core/app/utils/apiError';

interface TableRowWithOriginal {
  original: AdminKvTableRow;
}

interface DataTableSelectionRef {
  table?: {
    getFilteredSelectedRowModel: () => { rows: TableRowWithOriginal[] };
    resetRowSelection: () => void;
  };
}

const { t, te, locale } = useI18n();
const columnLabels = computed(() => ({
  key: t('admin.kv.key'),
  prefix: t('admin.kv.prefix'),
  value: t('admin.kv.preview'),
  temporary: t('admin.kv.warning'),
}));

const defaultFormValues: AdminKvMutationInput = {
  key: '',
  value: '',
  mode: 'raw',
};

const dataTableRef = ref<DataTableSelectionRef>();
const keys = ref<AdminKvTableRow[]>([]);
const valueCache = ref<Record<string, AdminKvValuePayload>>({});
const loading = ref(false);
const valuesLoading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const clearing = ref(false);
const dialogOpen = ref(false);
const deleteDialogOpen = ref(false);
const clearDialogOpen = ref(false);
const editingKey = ref<string | null>(null);
const keysToDelete = ref<string[]>([]);

const { handleSubmit, resetForm, setFieldError, values } = useForm<AdminKvMutationInput>({
  initialValues: { ...defaultFormValues },
  validationSchema: adminKvMutationSchema,
});

const isEditing = computed(() => editingKey.value !== null);
const currentMode = computed<AdminKvValueMode>(() => (values.mode === 'json' ? 'json' : 'raw'));
const tableRows = computed<AdminKvTableRow[]>(() =>
  keys.value.map((row) => {
    const value = valueCache.value[row.key];
    return value ? { ...row, value } : row;
  }),
);

const selectedKeys = computed(() => {
  if (!dataTableRef.value?.table) {
    return [];
  }

  return dataTableRef.value.table.getFilteredSelectedRowModel().rows.map((row) => row.original.key);
});

const editingRow = computed(() => {
  if (!editingKey.value) return null;
  return keys.value.find((row) => row.key === editingKey.value) ?? null;
});

const editingTemporaryReason = computed(() => editingRow.value?.temporaryReason ?? '');

const keysToDeleteIncludeTemporary = computed(() =>
  keysToDelete.value.some((key) => {
    const row = keys.value.find((candidate) => candidate.key === key);
    return row?.isTemporary ?? false;
  }),
);

const columns = computed(() =>
  createColumns(t, locale.value, handleEdit, (row) => openDeleteDialog([row.key])),
);

const onSubmit = handleSubmit(
  async (formValues) => {
    const payload: AdminKvMutationInput = {
      key: formValues.key,
      value: formValues.value,
      mode: formValues.mode,
    };
    const wasEditing = isEditing.value;

    try {
      saving.value = true;
      const response = await apiRequest<ApiResponse<AdminKvValuePayload>>(
        adminKvRoutes.ADMIN_KV_ITEMS,
        {
          method: isEditing.value ? 'PUT' : 'POST',
          body: payload,
        },
      );

      if (!response.success) {
        throw response;
      }

      valueCache.value = {
        ...valueCache.value,
        [response.data.key]: response.data,
      };

      toast.success(t(wasEditing ? 'admin.kv.updated' : 'admin.kv.created'));
      closeDialog();

      if (!wasEditing) {
        await fetchKeys();
      }
    } catch (error) {
      setApiFormErrors(parseApiError(error));
    } finally {
      saving.value = false;
    }
  },
  ({ errors }) => {
    const firstError = Object.values(errors).flat().filter(Boolean)[0];
    toast.error(t(firstError && te(firstError) ? firstError : 'errors.invalid_form'));
  },
);

async function fetchKeys() {
  try {
    loading.value = true;
    const response = await apiRequest<ApiResponse<AdminKvKeysPayload>>(adminKvRoutes.ADMIN_KV);

    if (!response.success) {
      throw response;
    }

    keys.value = response.data.keys;
    valueCache.value = {};
    dataTableRef.value?.table?.resetRowSelection();
  } catch {
    toast.error(t('admin.kv.load_failed'));
  } finally {
    loading.value = false;
  }
}

async function fetchValuesForKeys(candidateKeys: string[]): Promise<AdminKvValuePayload[]> {
  const missingKeys = candidateKeys.filter((key) => !valueCache.value[key]);

  if (missingKeys.length === 0) {
    return candidateKeys.map((key) => valueCache.value[key]).filter(isKvValuePayload);
  }

  try {
    valuesLoading.value = true;
    const response = await apiRequest<ApiResponse<AdminKvValuesResponsePayload>>(
      adminKvRoutes.ADMIN_KV_VALUES,
      {
        method: 'POST',
        body: { keys: missingKeys },
      },
    );

    if (!response.success) {
      throw response;
    }

    const nextCache = { ...valueCache.value };
    response.data.values.forEach((item) => {
      nextCache[item.key] = item;
    });
    valueCache.value = nextCache;

    return response.data.values;
  } catch {
    toast.error(t('admin.kv.load_values_failed'));
    return [];
  } finally {
    valuesLoading.value = false;
  }
}

function handleVisibleRows(rows: AdminKvTableRow[]) {
  const visibleKeys = rows.map((row) => row.key);
  if (visibleKeys.length === 0) return;

  void fetchValuesForKeys(visibleKeys);
}

function openCreateDialog() {
  editingKey.value = null;
  resetForm({ values: { ...defaultFormValues } });
  dialogOpen.value = true;
}

async function handleEdit(row: AdminKvTableRow) {
  const value = await getValueForKey(row.key);

  if (!value) {
    toast.error(t('admin.kv.load_selected_failed'));
    return;
  }

  editingKey.value = row.key;
  resetForm({
    values: {
      key: row.key,
      value: value.value,
      mode: value.mode,
    },
  });
  dialogOpen.value = true;
}

function closeDialog() {
  dialogOpen.value = false;
  editingKey.value = null;
  resetForm({ values: { ...defaultFormValues } });
}

function openBulkDeleteDialog() {
  if (selectedKeys.value.length === 0) return;

  if (selectedKeys.value.length > 1000) {
    toast.error(t('admin.kv.delete_limit'));
    return;
  }

  openDeleteDialog(selectedKeys.value);
}

function openDeleteDialog(deleteKeys: string[]) {
  keysToDelete.value = [...deleteKeys];
  deleteDialogOpen.value = true;
}

async function confirmDelete() {
  if (keysToDelete.value.length === 0) return;

  try {
    deleting.value = true;
    const response = await apiRequest<ApiResponse<AdminKvDeletePayload>>(
      adminKvRoutes.ADMIN_KV_DELETE,
      {
        method: 'POST',
        body: { keys: keysToDelete.value },
      },
    );

    if (!response.success) {
      throw response;
    }

    toast.success(t('admin.kv.deleted', response.data.deleted));
    keysToDelete.value = [];
    deleteDialogOpen.value = false;
    await fetchKeys();
  } catch {
    toast.error(t('admin.kv.delete_failed'));
  } finally {
    deleting.value = false;
  }
}

async function clearKvAndCache() {
  try {
    clearing.value = true;
    const response = await apiRequest<ApiResponse<ClearedPayload>>(adminKvRoutes.ADMIN_KV_CLEAR, {
      method: 'POST',
    });

    if (!response.success) {
      throw response;
    }

    toast.success(t('admin.kv.cleared'));
    clearDialogOpen.value = false;
    await fetchKeys();
  } catch {
    toast.error(t('admin.kv.clear_failed'));
  } finally {
    clearing.value = false;
  }
}

async function reloadKv() {
  await fetchKeys();
}

async function getValueForKey(key: string): Promise<AdminKvValuePayload | null> {
  const cachedValue = valueCache.value[key];
  if (cachedValue) return cachedValue;

  const values = await fetchValuesForKeys([key]);
  return values.find((value) => value.key === key) ?? valueCache.value[key] ?? null;
}

function setApiFormErrors(error: ParsedApiError) {
  const errorKey = {
    KV_KEY_ALREADY_EXISTS: 'admin.kv.key_exists',
    KV_KEY_NOT_FOUND: 'admin.kv.key_missing',
    INVALID_JSON_VALUE: 'admin.kv.invalid_json',
  };
  const messageKey =
    Object.entries(errorKey).find(([code]) => code === error.code)?.[1] ?? 'admin.kv.save_failed';
  const keyErrors = error.fieldErrors.key;
  const valueErrors = error.fieldErrors.value;
  const modeErrors = error.fieldErrors.mode;

  if (keyErrors && keyErrors.length > 0) {
    setFieldError('key', keyErrors[0] ?? messageKey);
  }

  if (valueErrors && valueErrors.length > 0) {
    setFieldError('value', valueErrors[0] ?? messageKey);
  }

  if (modeErrors && modeErrors.length > 0) {
    setFieldError('mode', modeErrors[0] ?? messageKey);
  }

  if (!keyErrors && !valueErrors && !modeErrors) {
    setFieldError('value', messageKey);
  }

  toast.error(t(messageKey));
}

function isKvValuePayload(value: AdminKvValuePayload | undefined): value is AdminKvValuePayload {
  return value !== undefined;
}

onMounted(() => {
  void fetchKeys();
});
</script>
