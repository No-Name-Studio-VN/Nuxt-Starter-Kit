<template>
  <div class="space-y-6">
    <!-- Header with Actions -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-2xl font-semibold">{{ $t('admin.flags.title') }}</h2>
        <p class="text-sm text-muted-foreground mt-1">
          {{ $t('admin.flags.description') }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" :disabled="loading" @click="addMissingDefaults">
          <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
          {{ $t('admin.flags.add_defaults') }}
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
              {{ $t('admin.flags.import_export') }}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="exportFlags">
              <Download class="size-4" />
              {{ $t('admin.flags.export_json') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="triggerImport">
              <Upload class="size-4" />
              {{ $t('admin.flags.import_json') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog v-model:open="isDialogOpen">
          <DialogTrigger as-child>
            <Button @click="openCreateDialog">
              <Plus class="size-4" />
              {{ $t('admin.flags.add') }}
            </Button>
          </DialogTrigger>
          <DialogScrollContent>
            <DialogHeader>
              <DialogTitle>{{
                t(isEditMode ? 'admin.flags.edit' : 'admin.flags.create_title')
              }}</DialogTitle>
              <DialogDescription>
                {{
                  t(isEditMode ? 'admin.flags.edit_description' : 'admin.flags.create_description')
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
                        <FieldLabel for="key"> {{ $t('admin.flags.key') }} </FieldLabel>
                        <Input
                          id="key"
                          :model-value="field.value"
                          :placeholder="$t('admin.flags.key_example')"
                          class="font-mono"
                          :disabled="isEditMode"
                          :aria-invalid="!!errors.length"
                          @update:model-value="field.onChange"
                        />
                        <FieldDescription>
                          {{ $t('admin.flags.key_hint') }}
                        </FieldDescription>
                        <FieldError
                          v-if="errors.length"
                          :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                        />
                      </Field>
                    </VeeField>
                    <VeeField v-slot="{ field, errors }" name="description">
                      <Field :data-invalid="!!errors.length">
                        <FieldLabel for="description">
                          {{ $t('admin.flags.description_label') }}
                        </FieldLabel>
                        <Textarea
                          id="description"
                          :model-value="field.value"
                          :placeholder="$t('admin.flags.description_placeholder')"
                          class="resize-none"
                          :rows="2"
                          :aria-invalid="!!errors.length"
                          @update:model-value="field.onChange"
                        />
                        <FieldError
                          v-if="errors.length"
                          :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                        />
                      </Field>
                    </VeeField>
                    <div class="grid gap-4 sm:grid-cols-2">
                      <VeeField v-slot="{ field, errors }" name="owner">
                        <Field :data-invalid="!!errors.length">
                          <FieldLabel for="owner"> {{ $t('admin.flags.owner') }} </FieldLabel>
                          <Input
                            id="owner"
                            :model-value="field.value"
                            :placeholder="$t('admin.flags.owner_placeholder')"
                            :aria-invalid="!!errors.length"
                            @update:model-value="field.onChange"
                          />
                          <FieldError
                            v-if="errors.length"
                            :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                          />
                        </Field>
                      </VeeField>
                      <VeeField v-slot="{ field, errors }" name="rolloutPct">
                        <Field :data-invalid="!!errors.length">
                          <FieldLabel for="rolloutPct">
                            {{ $t('admin.flags.rollout_label') }}
                          </FieldLabel>
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
                            {{ $t('admin.flags.rollout_hint') }}
                          </FieldDescription>
                          <FieldError
                            v-if="errors.length"
                            :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                          />
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
                        <Label for="enabled" class="cursor-pointer">
                          {{ $t('admin.flags.enabled') }}
                        </Label>
                      </div>
                    </VeeField>
                  </FieldGroup>
                </FieldSet>

                <FieldSeparator />

                <!-- Targeting Rules -->
                <FieldSet>
                  <FieldLegend>{{ $t('admin.flags.rules') }}</FieldLegend>
                  <FieldDescription>
                    {{ $t('admin.flags.rules_hint') }}
                  </FieldDescription>
                  <FieldGroup>
                    <VeeField v-slot="{ field }" name="rules.adminOnly">
                      <div class="flex items-center gap-3">
                        <Switch
                          id="adminOnly"
                          :model-value="field.value"
                          @update:model-value="field.onChange"
                        />
                        <Label for="adminOnly" class="cursor-pointer">
                          {{ $t('admin.flags.admin_only') }}
                        </Label>
                      </div>
                    </VeeField>
                    <VeeField v-slot="{ field }" name="rules.allowedTiers">
                      <Field>
                        <FieldLabel for="allowedTiers"> {{ $t('admin.flags.tiers') }} </FieldLabel>
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
                              {{
                                t(
                                  tier === 'free'
                                    ? 'admin.flags.tier.free'
                                    : 'admin.flags.tier.premium',
                                )
                              }}
                            </Label>
                          </div>
                        </div>
                        <FieldDescription> {{ $t('admin.flags.tiers_hint') }} </FieldDescription>
                      </Field>
                    </VeeField>
                    <VeeField v-slot="{ field }" name="rules.allowedUserIds">
                      <Field>
                        <FieldLabel for="allowedUserIds">
                          {{ $t('admin.flags.user_ids') }}
                        </FieldLabel>
                        <Input
                          id="allowedUserIds"
                          :model-value="Array.isArray(field.value) ? field.value.join(', ') : ''"
                          :placeholder="$t('admin.flags.user_ids_placeholder')"
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
                          {{ $t('admin.flags.user_ids_hint') }}
                        </FieldDescription>
                      </Field>
                    </VeeField>
                  </FieldGroup>
                </FieldSet>

                <FieldSeparator />

                <!-- Lifecycle -->
                <FieldSet>
                  <FieldLegend>{{ $t('admin.flags.lifecycle') }}</FieldLegend>
                  <FieldDescription> {{ $t('admin.flags.lifecycle_hint') }} </FieldDescription>
                  <FieldGroup>
                    <Field>
                      <div class="flex items-center justify-between">
                        <div class="space-y-1">
                          <FieldLabel for="has-expiry">
                            {{ $t('admin.flags.set_expiry') }}
                          </FieldLabel>
                          <FieldDescription>
                            {{ $t('admin.flags.set_expiry_hint') }}
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
                        <FieldLabel for="expiresAt"> {{ $t('admin.flags.expiry') }} </FieldLabel>
                        <Calendar
                          id="expiresAt"
                          v-model="expiryDate"
                          layout="month-and-year"
                          :locale="locale"
                          weekday-format="short"
                          class="rounded-md border shadow-sm mt-2 **:data-[slot=calendar-cell-trigger]:size-15.5!"
                          :aria-invalid="!!errors.length"
                        />
                        <FieldError
                          v-if="errors.length"
                          :errors="errors.map((key) => t(te(key) ? key : 'errors.invalid_field'))"
                        />
                      </Field>
                    </VeeField>
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
              <DialogFooter>
                <Button type="submit">
                  {{ t(isEditMode ? 'admin.flags.update' : 'admin.flags.create') }}
                </Button>
                <Button variant="outline" type="button" @click="closeDialog">
                  {{ $t('common.cancel') }}
                </Button>
              </DialogFooter>
            </form>
          </DialogScrollContent>
        </Dialog>
      </div>
    </div>

    <!-- Feature Flags DataTable -->
    <DataTable
      :columns="columns"
      :data="flags"
      :loading="loading"
      :column-labels="columnLabels"
      @update:data="fetchFlags"
    />
  </div>
</template>

<script setup lang="ts">
import { ArrowUpDown, Download, Plus, RefreshCw, Upload } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { DBFeatureFlag } from '#layers/feature-flags/types/featureFlags';
import { featureFlagInsertSchema } from '#layers/feature-flags/shared/schemas/featureFlagSchema';
import { featureFlagRoutes } from '#layers/feature-flags/shared/featureFlagRoutes';
import type { ApiResponse } from '#layers/server-core/types/api';
import DataTable from '@/components/DataTable.vue';
import { createColumns } from './columns';
import type { DateValue } from '@internationalized/date';
import { fromDate, getLocalTimeZone } from '@internationalized/date';
import { Field as VeeField, useForm } from 'vee-validate';
import type { z } from 'zod';

const { t, te, locale, n } = useI18n();
const loading = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const flags = ref<DBFeatureFlag[]>([]);
const isDialogOpen = ref(false);
const isEditMode = ref(false);
const hasExpiry = ref(false);
// shallowRef: a plain ref unwraps through UnwrapRef, which strips the private
// brand off @internationalized/date's classes and stops matching DateValue.
const expiryDate = shallowRef<DateValue>(fromDate(new Date(), getLocalTimeZone()));

// Create columns with callbacks
const columns = computed(() =>
  createColumns(
    t,
    locale.value,
    (percent) => n(percent / 100, { style: 'percent' }),
    openEditDialog,
    handleToggleEnabled,
    handleDeleteConfirm,
  ),
);

const columnLabels = computed(() => ({
  key: t('admin.flags.key'),
  enabled: t('admin.flags.status'),
  rolloutPct: t('admin.flags.rollout'),
  owner: t('admin.flags.owner'),
  expiresAt: t('admin.flags.expires'),
}));

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
    const key = Object.values(context.errors).flat().find(Boolean);
    toast.error(t(key && te(key) ? key : 'errors.invalid_form'));
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
    const response = await apiRequest<ApiResponse<DBFeatureFlag[]>>(
      featureFlagRoutes.ADMIN_FEATURE_FLAGS,
    );
    if (!response.success) {
      throw response;
    }
    flags.value = response.data;
  } catch {
    toast.error(t('admin.flags.load_failed'));
  }
  loading.value = false;
}

async function addMissingDefaults() {
  if (loading.value) return;

  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<{ created: number; skipped: number }>>(
      featureFlagRoutes.adminFeatureFlagsSeedDefaults(),
      {
        method: 'POST',
      },
    );
    if (!response.success) {
      throw response;
    }

    const { created, skipped } = response.data;
    toast.success(t('admin.flags.defaults_added', { created, skipped }));
    await fetchFlags();
  } catch {
    toast.error(t('admin.flags.defaults_failed'));
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

function flagErrorMessage(error: unknown, fallback: string) {
  const { code, fieldErrors } = parseApiError(error);
  if (code === 'FEATURE_FLAG_ALREADY_EXISTS') return t('admin.flags.key_exists');
  if (code === 'FEATURE_FLAG_NOT_FOUND') return t('admin.flags.not_found');
  if (code === 'VALIDATION_ERROR') {
    const key = Object.values(fieldErrors)
      .flat()
      .find((key) => te(key));
    return t(key ?? 'errors.invalid_form');
  }
  return t(fallback);
}

async function createFlag(data: ReturnType<typeof buildFeatureFlagPayload>) {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      featureFlagRoutes.ADMIN_FEATURE_FLAGS,
      {
        method: 'POST',
        body: data,
      },
    );
    if (!response.success) {
      throw response;
    }
    toast.success(t('admin.flags.created'));
    closeDialog();
    await fetchFlags();
    loading.value = false;
  } catch (error) {
    toast.error(flagErrorMessage(error, 'admin.flags.create_failed'));
  }
  loading.value = false;
}

async function updateFlag(data: ReturnType<typeof buildFeatureFlagPayload>) {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      featureFlagRoutes.adminFeatureFlag(data.key),
      {
        method: 'PUT',
        body: data,
      },
    );
    if (!response.success) {
      throw response;
    }
    toast.success(t('admin.flags.updated'));
    closeDialog();
    await fetchFlags();
  } catch (error) {
    toast.error(flagErrorMessage(error, 'admin.flags.update_failed'));
  }
  loading.value = false;
}

async function deleteFlag(key: string) {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      featureFlagRoutes.adminFeatureFlag(key),
      {
        method: 'DELETE',
      },
    );
    if (!response.success) {
      throw response;
    }
    toast.success(t('admin.flags.deleted'));
    await fetchFlags();
  } catch (error) {
    toast.error(flagErrorMessage(error, 'admin.flags.delete_failed'));
  }
  loading.value = false;
}

async function toggleEnabled(flag: DBFeatureFlag) {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      featureFlagRoutes.adminFeatureFlag(flag.key),
      {
        method: 'PUT',
        body: { enabled: !flag.enabled },
      },
    );
    if (!response.success) {
      throw response;
    }
    toast.success(
      t(flag.enabled ? 'admin.flags.flag_disabled' : 'admin.flags.flag_enabled', { key: flag.key }),
    );
    await fetchFlags();
  } catch (error) {
    toast.error(flagErrorMessage(error, 'admin.flags.toggle_failed'));
  }
  loading.value = false;
}

// ── Import / Export ──────────────────────────────────────

async function exportFlags() {
  loading.value = true;
  try {
    const response = await apiRequest<ApiResponse<DBFeatureFlag[]>>(
      featureFlagRoutes.adminFeatureFlagsExport(),
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
    toast.success(t('admin.flags.exported', response.data.length));
  } catch {
    toast.error(t('admin.flags.export_failed'));
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
      toast.error(t('admin.flags.invalid_json'));
      return;
    }

    const flags = isUnknownArray(parsed) ? parsed : hasFlagsArray(parsed) ? parsed.flags : null;

    if (!flags) {
      toast.error(t('admin.flags.invalid_array'));
      return;
    }

    const response = await apiRequest<
      ApiResponse<{ created: number; updated: number; skipped: number }>
    >(featureFlagRoutes.adminFeatureFlagsImport(), {
      method: 'POST',
      body: { flags },
    });

    if (!response.success) {
      throw response;
    }

    const { created, updated, skipped } = response.data;
    toast.success(t('admin.flags.imported', { created, updated, skipped }));

    await fetchFlags();
  } catch (error) {
    toast.error(flagErrorMessage(error, 'admin.flags.import_failed'));
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
