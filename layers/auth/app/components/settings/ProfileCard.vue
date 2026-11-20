<script setup lang="ts">
import { CheckIcon } from '@lucide/vue';
import { Field as VeeField, useForm } from 'vee-validate';
import { toast } from 'vue-sonner';
import { normalizeEmail } from '#shared/utils/normalizeEmail';
import { useUsernameAvailability } from '#layers/auth/app/composables/useUsernameAvailability';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { settingsProfileSchema } from '#layers/auth/shared/schemas/userSchema';
import type { ProfileUpdateData } from '#layers/auth/types/models/profile';
import type { SettingsSectionProps } from '#layers/auth/types/settings';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const props = defineProps<SettingsSectionProps>();
const { t, te } = useI18n();
const { fetch: refreshSession } = useUserSession();

function profileValues() {
  const { name, username, email } = props.profile;
  return { name, username, email: normalizeEmail(email) };
}

const saved = ref(profileValues());
const { values, meta, handleSubmit, isSubmitting, resetForm, resetField, setFieldError } = useForm({
  initialValues: { ...saved.value, currentPassword: '' },
  validationSchema: settingsProfileSchema,
});
const { candidate, availability, retry } = useUsernameAvailability(
  () => values.username,
  () => saved.value.username,
);
const emailChanged = computed(() => props.profile.hasPassword && normalizeEmail(values.email) !== saved.value.email);
const hasChanges = computed(() =>
  values.name.trim() !== saved.value.name || candidate.value !== saved.value.username || emailChanged.value,
);
const usernameInvalid = computed(() => availability.value === 'taken' || availability.value === 'invalid');

watch(() => props.profile, () => {
  if (!meta.value.dirty && !isSubmitting.value) {
    saved.value = profileValues();
    resetForm({ values: saved.value });
  }
});

function fieldMessages(errors: string[], fallback: string) {
  return errors.map((key) => t(te(key) ? key : fallback));
}

const saveProfile = handleSubmit(async ({ name, username, email, currentPassword }) => {
  if (!hasChanges.value || candidate.value !== username || availability.value !== 'available') return;

  const changingEmail = emailChanged.value;
  if (changingEmail && !currentPassword) {
    setFieldError('currentPassword', 'validation.current_password_required');
    return;
  }

  let partiallySaved = false;
  try {
    if (name !== saved.value.name || changingEmail) {
      const response = await apiRequest<ApiResponse<ProfileUpdateData>>(authRoutes.userProfile(props.profile.id), {
        method: 'PATCH',
        body: changingEmail ? { name, email, currentPassword } : { name, email: saved.value.email },
      });
      if (!response.success) throw response;
      if (changingEmail) resetField('currentPassword');
      saved.value = { ...saved.value, name: response.data.name, email: normalizeEmail(response.data.email) };
      partiallySaved = true;
    }

    if (username !== saved.value.username) {
      const response = await apiRequest<ApiResponse<ProfileUpdateData>>(authRoutes.userUsername('me'), {
        method: 'PATCH',
        body: { username },
      });
      if (!response.success) throw response;
      saved.value = { ...saved.value, username: response.data.username };
    }

    resetForm({ values: saved.value });
    toast.success(t('account_page.saved_toast'));
    await Promise.all([refreshSession(), props.refresh()]);
  } catch (error) {
    const parsed = parseApiError(error);
    if (parsed.code === 'USERNAME_TAKEN') {
      availability.value = 'taken';
      setFieldError('username', 'auth.username_taken');
    } else if (parsed.code === 'EMAIL_ALREADY_IN_USE') {
      setFieldError('email', 'account_page.email_in_use');
    } else if (parsed.code === 'EMAIL_CHANGE_REQUIRES_PASSWORD') {
      setFieldError('email', 'account_page.email_change_requires_password');
    } else {
      const fields = ['name', 'username', 'email', 'currentPassword'] satisfies (keyof typeof values)[];
      let hasFieldError = false;
      for (const field of fields) {
        const message = parsed.fieldErrors[field]?.[0];
        if (message) {
          setFieldError(field, message);
          hasFieldError = true;
        }
      }
      if (!hasFieldError) toast.error(t('account_page.save_error'));
    }
    if (partiallySaved) {
      toast.info(t('account_page.save_partial'));
      await Promise.all([refreshSession(), props.refresh()]);
    }
  }
});
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ t('account_page.heading') }}</CardTitle>
      <CardDescription>{{ t('account_page.profile_description') }}</CardDescription>
    </CardHeader>
    <CardContent>
      <form novalidate @submit="saveProfile">
        <FieldGroup>
          <VeeField v-slot="{ field, errors }" name="name">
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="account-name">{{ t('account_page.full_name') }}</FieldLabel>
              <Input
                id="account-name"
                :model-value="field.value"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                :aria-describedby="errors.length ? 'account-name-error' : undefined"
                autocomplete="name"
                @update:model-value="field.onChange"
                @blur="field.onBlur"
              />
              <FieldError v-if="errors.length" id="account-name-error" :errors="fieldMessages(errors, 'validation.name_required')" />
            </Field>
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="username">
            <Field :data-invalid="usernameInvalid || !!errors.length">
              <FieldLabel for="account-username">{{ t('account_page.username') }}</FieldLabel>
              <Input
                id="account-username"
                :model-value="field.value"
                :disabled="isSubmitting"
                :aria-invalid="usernameInvalid || !!errors.length"
                aria-describedby="account-username-status"
                autocomplete="username"
                autocapitalize="none"
                :spellcheck="false"
                @update:model-value="field.onChange"
                @blur="field.onBlur"
              />
              <div id="account-username-status" class="flex flex-wrap items-center gap-x-2 gap-y-1 empty:absolute" aria-live="polite" aria-atomic="true">
                <FieldError v-if="availability === 'taken'">{{ t('auth.username_taken') }}</FieldError>
                <FieldError v-else-if="usernameInvalid">{{ t('onboarding.username.invalid') }}</FieldError>
                <FieldError v-else-if="errors.length" :errors="fieldMessages(errors, 'onboarding.username.invalid')" />
                <FieldDescription v-else-if="candidate !== saved.username" class="flex items-center gap-2">
                  <Spinner v-if="availability === 'checking'" aria-hidden="true" />
                  <CheckIcon v-else-if="availability === 'available'" class="size-4" aria-hidden="true" />
                  {{ t(`onboarding.username.${availability}`) }}
                </FieldDescription>
                <Button v-if="availability === 'failed'" type="button" variant="link" size="sm" @click="retry">
                  {{ t('settings.retry') }}
                </Button>
              </div>
            </Field>
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="email">
            <Field :data-invalid="!!errors.length">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <FieldLabel for="account-email">{{ t('account_page.email') }}</FieldLabel>
                <Badge v-if="!profile.emailVerified" variant="secondary">{{ t('account_page.email_not_verified') }}</Badge>
              </div>
              <Input
                id="account-email"
                :model-value="field.value"
                type="email"
                autocomplete="email"
                :readonly="!profile.hasPassword"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                aria-describedby="account-email-status"
                @update:model-value="field.onChange"
                @blur="field.onBlur"
              />
              <div id="account-email-status" class="flex flex-col gap-1" aria-live="polite">
                <FieldDescription v-if="!profile.hasPassword">{{ t('account_page.email_change_requires_password') }}</FieldDescription>
                <FieldDescription v-else-if="emailChanged">{{ t('account_page.email_change_note') }}</FieldDescription>
                <FieldError v-if="errors.length" :errors="fieldMessages(errors, 'validation.email_required')" />
              </div>
            </Field>
          </VeeField>

          <VeeField v-if="emailChanged" v-slot="{ field, errors }" name="currentPassword">
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="account-current-password">{{ t('settings.password.currentPassword') }}</FieldLabel>
              <Input
                id="account-current-password"
                type="password"
                autocomplete="current-password"
                required
                :model-value="field.value"
                :disabled="isSubmitting"
                :aria-invalid="!!errors.length"
                :aria-describedby="errors.length ? 'account-current-password-error' : undefined"
                @update:model-value="field.onChange"
                @blur="field.onBlur"
              />
              <FieldError v-if="errors.length" id="account-current-password-error" :errors="fieldMessages(errors, 'validation.current_password_incorrect')" />
            </Field>
          </VeeField>

          <div class="flex justify-end">
            <Button type="submit" class="w-full sm:w-auto" :disabled="isSubmitting || !hasChanges || availability !== 'available'">
              <Spinner v-if="isSubmitting" data-icon="inline-start" aria-hidden="true" />
              {{ t('account_page.complete') }}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </CardContent>
  </Card>
</template>
