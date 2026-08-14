<template>
  <div class="flex flex-col gap-6">
    <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex flex-col gap-1">
        <h2 class="text-2xl font-semibold text-foreground">KV Store</h2>
        <p class="text-sm text-muted-foreground">
          Browse all KV keys, lazily load visible values, and manage entries with admin-only
          safeguards.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <AlertDialog v-model:open="clearDialogOpen">
          <AlertDialogTrigger as-child>
            <Button variant="outline">
              <Trash2Icon data-icon="inline-start" />
              Clear all KV/cache
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear the entire KV namespace and server cache?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes every KV key and clears the server cache storage. It can remove feature
                flag cache data, auth challenges, decrypt tokens, and premium media cache entries.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                :disabled="clearing"
                @click="clearKvAndCache"
              >
                Clear all KV/cache
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button @click="openCreateDialog">
          <PlusIcon data-icon="inline-start" />
          Add key
        </Button>
      </div>
    </section>

    <AlertBox variant="warning">
      <AlertTriangleIcon class="size-4 shrink-0" />
      <AlertBoxContent>
        <AlertBoxTitle>Full KV namespace access</AlertBoxTitle>
        <AlertBoxDescription>
          Values are loaded only for the current table page and cached in this browser session until
          reload. Temporary keys are flagged, but all keys remain editable. Saving a TTL-backed key
          may remove its expiration because TTL metadata is not exposed.
        </AlertBoxDescription>
      </AlertBoxContent>
    </AlertBox>

    <DataTable
      ref="dataTableRef"
      :columns="columns"
      :data="tableRows"
      :loading="loading || valuesLoading"
      search-placeholder="Search KV keys or prefixes"
      empty-title="No KV keys found."
      empty-description="Create a key or reload the namespace."
      :column-labels="columnLabels"
      @update:data="reloadKv"
      @update:visible-data="handleVisibleRows"
    >
      <template #toolbar-actions>
        <Badge variant="secondary"> {{ keys.length }} key(s) </Badge>
      </template>
      <template #footer-leading>
        <span v-if="valuesLoading">Loading visible values… </span>
      </template>
    </DataTable>

    <div
      v-if="selectedKeys.length > 0"
      class="flex flex-col gap-3 rounded-lg border bg-muted p-4 sm:flex-row sm:items-center"
    >
      <div class="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
        <InfoIcon class="size-4" />
        <span>{{ selectedKeys.length }} key(s) selected</span>
      </div>
      <Button variant="destructive" :disabled="deleting" @click="openBulkDeleteDialog">
        <Trash2Icon data-icon="inline-start" />
        Delete selected
      </Button>
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogScrollContent class="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{{ isEditing ? 'Edit KV value' : 'Create KV key' }}</DialogTitle>
          <DialogDescription>
            {{
              isEditing
                ? 'Update the selected KV value. Use raw mode for plain text and JSON mode for structured values.'
                : 'Create a new KV key with either raw text or a JSON value.'
            }}
          </DialogDescription>
        </DialogHeader>

        <AlertBox v-if="editingTemporaryReason" variant="warning">
          <AlertTriangleIcon class="size-4 shrink-0" />
          <AlertBoxContent>
            <AlertBoxTitle>Temporary or cache-sensitive key</AlertBoxTitle>
            <AlertBoxDescription>
              {{ editingTemporaryReason }} Saving this key may remove its expiration because TTL
              metadata is not exposed.
            </AlertBoxDescription>
          </AlertBoxContent>
        </AlertBox>

        <form class="flex flex-col gap-6" @submit.prevent="onSubmit">
          <FieldGroup>
            <VeeField v-slot="{ field, errors }" name="key">
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="admin-kv-key"> Key </FieldLabel>
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
                  Keys can use any non-empty string up to Cloudflare KV's 512-byte key limit.
                </FieldDescription>
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>

            <VeeField v-slot="{ field, errors }" name="mode">
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="admin-kv-mode"> Value mode </FieldLabel>
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
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="raw"> Raw text </SelectItem>
                      <SelectItem value="json"> JSON </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Raw text saves exactly as typed. JSON mode parses the editor content before
                  saving.
                </FieldDescription>
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>

            <VeeField v-slot="{ field, errors }" name="value">
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="admin-kv-value"> Value </FieldLabel>
                <AdminKvValueEditor
                  id="admin-kv-value"
                  :model-value="String(field.value ?? '')"
                  :mode="currentMode"
                  :disabled="saving"
                  @update:model-value="field.onChange"
                />
                <FieldDescription>
                  Existing non-string KV values are shown as formatted JSON. Existing raw strings
                  that parse as JSON open in JSON mode.
                </FieldDescription>
                <FieldError v-if="errors.length" :errors="errors" />
              </Field>
            </VeeField>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" :disabled="saving" @click="closeDialog">
              Cancel
            </Button>
            <Button type="submit" :is-loading="saving">
              {{ isEditing ? 'Save value' : 'Create key' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogScrollContent>
    </Dialog>

    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete KV key(s)?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {{ keysToDelete.length }} KV key(s). This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertBox v-if="keysToDeleteIncludeTemporary" variant="warning">
          <AlertTriangleIcon class="size-4 shrink-0" />
          <AlertBoxContent>
            <AlertBoxTitle>Selection includes temporary or cache-sensitive keys</AlertBoxTitle>
            <AlertBoxDescription>
              Deleting these keys can interrupt active auth, decrypt, media, or cache flows. Editing
              TTL-backed keys can also make them permanent.
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
          <AlertDialogCancel :disabled="deleting"> Cancel </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            :disabled="deleting || keysToDelete.length === 0"
            @click="confirmDelete"
          >
            Delete key(s)
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
import { adminKvMutationSchema } from '#shared/schemas/adminKvSchema';
import type { AdminKvMutationInput, AdminKvValueMode } from '#shared/schemas/adminKvSchema';
import { apiRoutes } from '#shared/apiRoutes';
import type { ApiResponse, ParsedApiError } from '~~/types/api';
import type {
  AdminKvDeletePayload,
  AdminKvKeysPayload,
  AdminKvValuePayload,
  AdminKvValuesResponsePayload,
  ClearedPayload,
} from '~~/types/admin';
import DataTable from '@/components/DataTable.vue';
import AdminKvValueEditor from './AdminKvValueEditor.client.vue';
import { createColumns } from './columns';
import type { AdminKvTableRow } from './types';
import { parseApiError } from '@/utils/apiError';

interface TableRowWithOriginal {
  original: AdminKvTableRow;
}

interface DataTableSelectionRef {
  table?: {
    getFilteredSelectedRowModel: () => { rows: TableRowWithOriginal[] };
    resetRowSelection: () => void;
  };
}

const columnLabels = {
  key: 'Key',
  prefix: 'Prefix',
  value: 'Value preview',
  temporary: 'Warning',
};

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

const columns = computed(() => createColumns(handleEdit, (row) => openDeleteDialog([row.key])));

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
        apiRoutes.ADMIN_KV_ITEMS,
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

      toast.success(wasEditing ? 'KV value updated successfully' : 'KV key created successfully');
      closeDialog();

      if (!wasEditing) {
        await fetchKeys();
      }
    } catch (error) {
      setApiFormErrors(parseApiError(error, 'Failed to save the KV item'));
    } finally {
      saving.value = false;
    }
  },
  ({ errors }) => {
    const firstError = Object.values(errors).flat().filter(Boolean)[0];
    toast.error(firstError ?? 'Please fix the form errors');
  },
);

async function fetchKeys() {
  try {
    loading.value = true;
    const response = await apiRequest<ApiResponse<AdminKvKeysPayload>>(apiRoutes.ADMIN_KV);

    if (!response.success) {
      throw response;
    }

    keys.value = response.data.keys;
    valueCache.value = {};
    dataTableRef.value?.table?.resetRowSelection();
  } catch (error) {
    toast.error(parseApiError(error, 'Failed to load KV keys').message);
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
      apiRoutes.ADMIN_KV_VALUES,
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
  } catch (error) {
    toast.error(parseApiError(error, 'Failed to load visible KV values').message);
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
    toast.error('Failed to load the selected KV value');
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
    toast.error('Select 1000 or fewer KV keys before bulk deleting');
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
      apiRoutes.ADMIN_KV_DELETE,
      {
        method: 'POST',
        body: { keys: keysToDelete.value },
      },
    );

    if (!response.success) {
      throw response;
    }

    toast.success(`Deleted ${response.data.deleted} KV key(s)`);
    keysToDelete.value = [];
    deleteDialogOpen.value = false;
    await fetchKeys();
  } catch (error) {
    toast.error(parseApiError(error, 'Failed to delete KV key(s)').message);
  } finally {
    deleting.value = false;
  }
}

async function clearKvAndCache() {
  try {
    clearing.value = true;
    const response = await apiRequest<ApiResponse<ClearedPayload>>(apiRoutes.ADMIN_KV_CLEAR, {
      method: 'POST',
    });

    if (!response.success) {
      throw response;
    }

    toast.success('KV namespace and server cache cleared successfully');
    clearDialogOpen.value = false;
    await fetchKeys();
  } catch (error) {
    toast.error(parseApiError(error, 'Failed to clear KV and server cache').message);
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
  const keyErrors = error.fieldErrors.key;
  const valueErrors = error.fieldErrors.value;
  const modeErrors = error.fieldErrors.mode;

  if (keyErrors && keyErrors.length > 0) {
    setFieldError('key', keyErrors[0] ?? error.message);
  }

  if (valueErrors && valueErrors.length > 0) {
    setFieldError('value', valueErrors[0] ?? error.message);
  }

  if (modeErrors && modeErrors.length > 0) {
    setFieldError('mode', modeErrors[0] ?? error.message);
  }

  if (!keyErrors && !valueErrors && !modeErrors) {
    setFieldError('value', error.message);
  }

  toast.error(error.message);
}

function isKvValuePayload(value: AdminKvValuePayload | undefined): value is AdminKvValuePayload {
  return value !== undefined;
}

onMounted(() => {
  void fetchKeys();
});
</script>
