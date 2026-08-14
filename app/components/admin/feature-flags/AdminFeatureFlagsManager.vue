<template>
  <div class="space-y-6">
    <!-- Header with Actions -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-2xl font-semibold">Feature Flags</h2>
        <p class="text-sm text-muted-foreground mt-1">
          Create, manage, and control feature rollouts for your application
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" :disabled="loading" @click="addMissingDefaults">
          <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
          Add Missing Defaults
        </Button>
        <!-- Import / Export -->
        <input
          ref="fileInputRef"
          type="file"
          accept=".json"
          class="hidden"
          @change="handleFileImport"
        />
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline">
              <ArrowUpDown class="size-4" />
              Import / Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="exportFlags">
              <Download class="size-4" />
              Export as JSON
            </DropdownMenuItem>
            <DropdownMenuItem @click="triggerImport">
              <Upload class="size-4" />
              Import from JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog v-model:open="isDialogOpen">
          <DialogTrigger as-child>
            <Button @click="openCreateDialog">
              <Plus class="size-4" />
              Add Flag
            </Button>
          </DialogTrigger>
          <DialogScrollContent>
            <DialogHeader>
              <DialogTitle>{{ isEditMode ? 'Edit Feature Flag' : 'Create New Flag' }}</DialogTitle>
              <DialogDescription>
                {{
                  isEditMode
                    ? 'Update flag configuration and targeting rules.'
                    : 'Add a new feature flag to control feature rollouts.'
                }}
              </DialogDescription>
            </DialogHeader>
            <form class="space-y-6" @submit.prevent="onSubmit">
              <FieldGroup>
                <!-- Basic Info -->
                <FieldSet>
                  <FieldGroup>
                    <VeeField v-slot="{ field, errors }" name="key">
                      <Field :data-invalid="!!errors.length">
                        <FieldLabel for="key"> Flag Key </FieldLabel>
                        <Input
                          id="key"
                          :model-value="field.value"
                          placeholder="e.g., new-reader-v2"
                          class="font-mono"
                          :disabled="isEditMode"
                          :aria-invalid="!!errors.length"
                          @update:model-value="field.onChange"
                        />
                        <FieldDescription>
                          Lowercase alphanumeric with hyphens. Cannot be changed after creation.
                        </FieldDescription>
                        <FieldError v-if="errors.length" :errors="errors" />
                      </Field>
                    </VeeField>
                    <VeeField v-slot="{ field, errors }" name="description">
                      <Field :data-invalid="!!errors.length">
                        <FieldLabel for="description"> Description </FieldLabel>
                        <Textarea
                          id="description"
                          :model-value="field.value"
                          placeholder="What does this flag control?"
                          class="resize-none"
                          :rows="2"
                          :aria-invalid="!!errors.length"
                          @update:model-value="field.onChange"
                        />
                        <FieldError v-if="errors.length" :errors="errors" />
                      </Field>
                    </VeeField>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <VeeField v-slot="{ field, errors }" name="owner">
                        <Field :data-invalid="!!errors.length">
                          <FieldLabel for="owner"> Owner </FieldLabel>
                          <Input
                            id="owner"
                            :model-value="field.value"
                            placeholder="e.g., Team Name"
                            :aria-invalid="!!errors.length"
                            @update:model-value="field.onChange"
                          />
                          <FieldError v-if="errors.length" :errors="errors" />
                        </Field>
                      </VeeField>
                      <VeeField v-slot="{ field, errors }" name="rolloutPct">
                        <Field :data-invalid="!!errors.length">
                          <FieldLabel for="rolloutPct"> Rollout % </FieldLabel>
                          <Input
                            id="rolloutPct"
                            :model-value="String(field.value ?? '')"
                            type="number"
                            min="0"
                            max="100"
                            placeholder="100"
                            :aria-invalid="!!errors.length"
                            @update:model-value="(value) => field.onChange(toOptionalNumber(value))"
                          />
                          <FieldDescription>
                            Percentage of users who see this feature (0-100)
                          </FieldDescription>
                          <FieldError v-if="errors.length" :errors="errors" />
                        </Field>
                      </VeeField>
                    </div>
                    <VeeField v-slot="{ field }" name="enabled">
                      <div class="flex items-center gap-3">
                        <Switch
                          id="enabled"
                          :model-value="field.value"
                          @update:model-value="field.onChange"
                        />
                        <Label for="enabled" class="cursor-pointer"> Enabled </Label>
                      </div>
                    </VeeField>
                  </FieldGroup>
                </FieldSet>

                <FieldSeparator />

                <!-- Targeting Rules -->
                <FieldSet>
                  <FieldLegend>Targeting Rules</FieldLegend>
                  <FieldDescription>
                    Optional: restrict this flag to specific user segments
                  </FieldDescription>
                  <FieldGroup>
                    <VeeField v-slot="{ field }" name="rules.adminOnly">
                      <div class="flex items-center gap-3">
                        <Switch
                          id="adminOnly"
                          :model-value="field.value"
                          @update:model-value="field.onChange"
                        />
                        <Label for="adminOnly" class="cursor-pointer"> Admin Only </Label>
                      </div>
                    </VeeField>
                    <VeeField v-slot="{ field }" name="rules.allowedTiers">
                      <Field>
                        <FieldLabel for="allowedTiers"> Allowed Tiers </FieldLabel>
                        <div class="flex gap-3">
                          <div
                            v-for="tier in ['free', 'premium']"
                            :key="tier"
                            class="flex items-center gap-2"
                          >
                            <Checkbox
                              :id="`tier-${tier}`"
                              :model-value="
                                Array.isArray(field.value) &&
                                field.value
                                  .filter((item) => typeof item === 'string')
                                  .includes(tier)
                              "
                              @update:model-value="
                                (checked) => {
                                  const current = Array.isArray(field.value)
                                    ? field.value.filter((item) => typeof item === 'string')
                                    : [];
                                  if (checked) field.onChange([...current, tier]);
                                  else field.onChange(current.filter((t) => t !== tier));
                                }
                              "
                            />
                            <Label :for="`tier-${tier}`" class="cursor-pointer capitalize">
                              {{ tier }}
                            </Label>
                          </div>
                        </div>
                        <FieldDescription> Leave unchecked to allow all tiers </FieldDescription>
                      </Field>
                    </VeeField>
                    <VeeField v-slot="{ field }" name="rules.allowedUserIds">
                      <Field>
                        <FieldLabel for="allowedUserIds"> Allowed User IDs </FieldLabel>
                        <Input
                          id="allowedUserIds"
                          :model-value="Array.isArray(field.value) ? field.value.join(', ') : ''"
                          placeholder="e.g., 1, 5, 42"
                          @update:model-value="
                            (value) => {
                              const str = String(value).trim();
                              if (!str) field.onChange(undefined);
                              else
                                field.onChange(
                                  str
                                    .split(',')
                                    .map((s) => parseInt(s.trim()))
                                    .filter((n) => !Number.isNaN(n) && n > 0),
                                );
                            }
                          "
                        />
                        <FieldDescription>
                          Comma-separated list of user IDs. Leave empty for all users.
                        </FieldDescription>
                      </Field>
                    </VeeField>
                  </FieldGroup>
                </FieldSet>

                <FieldSeparator />

                <!-- Lifecycle -->
                <FieldSet>
                  <FieldLegend>Lifecycle</FieldLegend>
                  <FieldDescription> Set an expiry date to prevent stale flags </FieldDescription>
                  <FieldGroup>
                    <Field>
                      <div class="flex items-center justify-between">
                        <div class="space-y-1">
                          <FieldLabel for="has-expiry"> Set expiry date </FieldLabel>
                          <FieldDescription>
                            Choose when this feature flag should expire.
                          </FieldDescription>
                        </div>
                        <Switch
                          id="has-expiry"
                          :model-value="hasExpiry"
                          @update:model-value="toggleExpiry"
                        />
                      </div>
                    </Field>
                    <VeeField v-if="hasExpiry" v-slot="{ errors }" name="expiresAt">
                      <Field :data-invalid="!!errors.length">
                        <FieldLabel for="expiresAt"> Expiry date </FieldLabel>
                        <Calendar
                          id="expiresAt"
                          v-model="expiryDate"
                          layout="month-and-year"
                          weekday-format="short"
                          class="rounded-md border shadow-sm mt-2 **:data-[slot=calendar-cell-trigger]:size-15.5!"
                          :aria-invalid="!!errors.length"
                        />
                        <FieldError v-if="errors.length" :errors="errors" />
                      </Field>
                    </VeeField>
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
              <DialogFooter>
                <Button type="submit">
                  {{ isEditMode ? 'Update' : 'Create' }}
                </Button>
                <Button variant="outline" type="button" @click="closeDialog"> Cancel </Button>
              </DialogFooter>
            </form>
          </DialogScrollContent>
        </Dialog>
      </div>
    </div>

    <!-- Feature Flags DataTable -->
    <DataTable :columns="columns" :data="flags" :loading="loading" @update:data="fetchFlags" />
  </div>
</template>

<script setup lang="ts">
import { ArrowUpDown, Download, Plus, RefreshCw, Upload } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { parseApiError } from '@/utils/apiError';
import type { DBFeatureFlag } from '#shared/db';
import { featureFlagInsertSchema } from '#shared/schemas/featureFlagSchema';
import { apiRoutes } from '#shared/apiRoutes';
import type { ApiResponse } from '~~/types/api';
import DataTable from '@/components/DataTable.vue';
import { createColumns } from './columns';
import type { DateValue } from '@internationalized/date';
import { fromDate, getLocalTimeZone } from '@internationalized/date';
import { Field as VeeField, useForm } from 'vee-validate';
import type { z } from 'zod';

const loading = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const flags = ref<DBFeatureFlag[]>([]);
const isDialogOpen = ref(false);
const isEditMode = ref(false);
const hasExpiry = ref(false);
const expiryDate = ref<DateValue>(fromDate(new Date(), getLocalTimeZone()));

// Create columns with callbacks
const columns = computed(() =>
  createColumns(openEditDialog, handleToggleEnabled, handleDeleteConfirm),
);

const defaultFlagValues: z.input<typeof featureFlagInsertSchema> = {
  key: '',
  description: '',
  enabled: false,
  rolloutPct: 100,
  owner: '',
  rules: null,
  expiresAt: null,
};

type FeatureFlagFormValues = z.input<typeof featureFlagInsertSchema>;

function buildFeatureFlagPayload(values: FeatureFlagFormValues) {
  const rules =
    values.rules &&
    Object.values(values.rules).every(
      (v) => v === undefined || v === false || (Array.isArray(v) && v.length === 0),
    )
      ? null
      : values.rules;

  return {
    ...values,
    rules,
    expiresAt: hasExpiry.value && expiryDate.value ? new Date(expiryDate.value.toString()) : null,
  };
}

function toOptionalNumber(value: string | number) {
  if (value === '') {
    return undefined;
  }

  return Number(value);
}

const { handleSubmit, resetForm, setFieldValue } = useForm<FeatureFlagFormValues>({
  initialValues: { ...defaultFlagValues },
  validationSchema: featureFlagInsertSchema,
});

const onSubmit = handleSubmit(
  async (values) => {
    const dataToSend = buildFeatureFlagPayload(values);

    if (isEditMode.value) {
      await updateFlag(dataToSend);
    } else {
      await createFlag(dataToSend);
    }
  },
  (context) => {
    const errorList = Object.values(context.errors).flat().filter(Boolean);
    const msg =
      errorList.length > 0
        ? errorList[0] || 'Please fix the errors above'
        : 'Please fix the errors above';
    toast.error(msg);
  },
);

watch(expiryDate, (newVal) => {
  if (hasExpiry.value && newVal) {
    setFieldValue('expiresAt', new Date(newVal.toString()));
  }
});

function openCreateDialog() {
  isEditMode.value = false;
  resetForm({ values: { ...defaultFlagValues } });
  hasExpiry.value = false;
  expiryDate.value = fromDate(new Date(), getLocalTimeZone());
  isDialogOpen.value = true;
}

function openEditDialog(flag: DBFeatureFlag) {
  isEditMode.value = true;
  resetForm({
    values: {
      key: flag.key,
      description: flag.description,
      enabled: flag.enabled,
      rolloutPct: flag.rolloutPct,
      owner: flag.owner,
      rules: flag.rules ? { ...flag.rules } : null,
      expiresAt: flag.expiresAt,
    },
  });
  if (flag.expiresAt) {
    hasExpiry.value = true;
    expiryDate.value = fromDate(new Date(flag.expiresAt), getLocalTimeZone());
  } else {
    hasExpiry.value = false;
  }
  isDialogOpen.value = true;
}

function closeDialog() {
  isDialogOpen.value = false;
  isEditMode.value = false;
  resetForm({ values: { ...defaultFlagValues } });
  hasExpiry.value = false;
  expiryDate.value = fromDate(new Date(), getLocalTimeZone());
}

function toggleExpiry(val: boolean) {
  hasExpiry.value = val;
  if (!val) {
    setFieldValue('expiresAt', null);
  }
}

async function fetchFlags() {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<DBFeatureFlag[]>>(apiRoutes.ADMIN_FEATURE_FLAGS);
    if (!response.success) {
      throw response;
    }
    flags.value = response.data;
  } catch (error: unknown) {
    toast.error(parseApiError(error, 'Failed to load feature flags').message);
  }
  loading.value = false;
}

async function addMissingDefaults() {
  if (loading.value) return;

  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<{ created: number; skipped: number }>>(
      apiRoutes.adminFeatureFlagsSeedDefaults(),
      {
        method: 'POST',
      },
    );
    if (!response.success) {
      throw response;
    }

    const { created, skipped } = response.data;
    toast.success(`Defaults added: ${created} created, ${skipped} skipped`);
    await fetchFlags();
  } catch (error: unknown) {
    toast.error(parseApiError(error, 'Failed to add missing defaults').message);
  } finally {
    loading.value = false;
  }
}

function handleToggleEnabled(flag: DBFeatureFlag) {
  toggleEnabled(flag);
}

function handleDeleteConfirm(flagKey: string) {
  deleteFlag(flagKey);
}

async function createFlag(data: ReturnType<typeof buildFeatureFlagPayload>) {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      apiRoutes.ADMIN_FEATURE_FLAGS,
      {
        method: 'POST',
        body: data,
      },
    );
    if (!response.success) {
      throw response;
    }
    toast.success('Feature flag created successfully');
    closeDialog();
    await fetchFlags();
    loading.value = false;
  } catch (error: unknown) {
    toast.error(parseApiError(error, 'Failed to create flag').message);
  }
  loading.value = false;
}

async function updateFlag(data: ReturnType<typeof buildFeatureFlagPayload>) {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      apiRoutes.adminFeatureFlag(data.key),
      {
        method: 'PUT',
        body: data,
      },
    );
    if (!response.success) {
      throw response;
    }
    toast.success('Feature flag updated successfully');
    closeDialog();
    await fetchFlags();
  } catch (error: unknown) {
    toast.error(parseApiError(error, 'Failed to update flag').message);
  }
  loading.value = false;
}

async function deleteFlag(key: string) {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      apiRoutes.adminFeatureFlag(key),
      {
        method: 'DELETE',
      },
    );
    if (!response.success) {
      throw response;
    }
    toast.success('Feature flag deleted successfully');
    await fetchFlags();
  } catch (error: unknown) {
    toast.error(parseApiError(error, 'Failed to delete flag').message);
  }
  loading.value = false;
}

async function toggleEnabled(flag: DBFeatureFlag) {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      apiRoutes.adminFeatureFlag(flag.key),
      {
        method: 'PUT',
        body: { enabled: !flag.enabled },
      },
    );
    if (!response.success) {
      throw response;
    }
    toast.success(`Flag "${flag.key}" ${flag.enabled ? 'disabled' : 'enabled'}`);
    await fetchFlags();
  } catch (error: unknown) {
    toast.error(parseApiError(error, 'Failed to toggle flag').message);
  }
  loading.value = false;
}

// ── Import / Export ──────────────────────────────────────

async function exportFlags() {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<DBFeatureFlag[]>>(
      apiRoutes.adminFeatureFlagsExport(),
    );
    if (!response.success) {
      throw response;
    }
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feature-flags-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${response.data.length} flag(s)`);
  } catch (error: unknown) {
    toast.error(parseApiError(error, 'Failed to export flags').message);
  }
  loading.value = false;
}

function triggerImport() {
  fileInputRef.value?.click();
}

async function handleFileImport(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;

  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = parseImportPayload(text);

    if (!parsed) {
      toast.error('Invalid JSON file');
      return;
    }

    const flags = isUnknownArray(parsed) ? parsed : hasFlagsArray(parsed) ? parsed.flags : null;

    if (!flags) {
      toast.error('Expected a JSON array of flag objects');
      return;
    }

    const response = await apiRequest<
      ApiResponse<{ created: number; updated: number; skipped: number }>
    >(apiRoutes.adminFeatureFlagsImport(), {
      method: 'POST',
      body: { flags },
    });

    if (!response.success) {
      throw response;
    }

    const { created, updated, skipped } = response.data;
    const parts: string[] = [];
    if (created > 0) parts.push(`${created} created`);
    if (updated > 0) parts.push(`${updated} updated`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    toast.success(`Import complete: ${parts.join(', ')}`);

    await fetchFlags();
  } catch (error: unknown) {
    toast.error(parseApiError(error, 'Failed to import flags').message);
  } finally {
    // Reset file input so the same file can be re-selected
    input.value = '';
  }
}

function parseImportPayload(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function hasFlagsArray(value: unknown): value is { flags: unknown[] } {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'flags' in value &&
    isUnknownArray(value.flags)
  );
}

onMounted(() => {
  fetchFlags();
});
</script>
