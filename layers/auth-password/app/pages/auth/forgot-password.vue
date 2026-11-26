<script setup lang="ts">
import { KeyRound } from '@lucide/vue';
import { Field as VeeField, useForm } from 'vee-validate';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { passwordRoutes } from '#layers/auth-password/shared/passwordRoutes';
import { forgotPasswordFormSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const challenge = useFormChallenge();
const { pending: challengePending } = challenge;
const isSubmitting = ref(false);
const isSubmitted = ref(false);
const error = ref('');
const { t } = useI18n();

const { handleSubmit } = useForm({
  initialValues: { email: '' },
  validationSchema: forgotPasswordFormSchema,
});

const onSubmit = handleSubmit(async (values) => {
  if (isSubmitting.value || challengePending.value) return;
  isSubmitting.value = true;
  error.value = '';

  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      passwordRoutes.AUTH_FORGOT_PASSWORD_REQUEST,
      {
        method: 'POST',
        headers: challenge.headers(),
        body: { email: values.email },
      },
    );
    if (!response.success) {
      throw response;
    }
    isSubmitted.value = true;
  } catch (err: unknown) {
    const parsed = parseApiError(err);
    error.value = challenge.errorKey(parsed) ?? 'auth_password.forgot_password_failed';
  } finally {
    challenge.reset();
    isSubmitting.value = false;
  }
});

definePageMeta({
  title: 'auth_password.forgot_password_title',
  breadcrumb: 'auth_password.forgot_password_breadcrumb',
  layout: false,
  middleware: ['guest'],
});

useSeo({
  title: computed(() => t('auth_password.forgot_password_title')),
  description: computed(() => t('auth_password.forgot_password_description')),
  type: 'website',
});
</script>

<template>
  <AuthPageLayout page="forgot-password">
    <div class="space-y-4">
      <div class="flex size-10 items-center justify-center rounded-md border bg-background/60">
        <KeyRound aria-hidden="true" class="size-5" />
      </div>
      <div class="space-y-1.5">
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ $t('auth_password.forgot_password_title') }}
        </h1>
        <p class="text-sm text-muted-foreground">
          {{
            t(
              isSubmitted
                ? 'auth_password.forgot_password_check_inbox'
                : 'auth_password.forgot_password_description',
            )
          }}
        </p>
      </div>
    </div>

    <Alert v-if="error" variant="destructive" role="alert">
      <AlertDescription>{{ t(error) }}</AlertDescription>
    </Alert>

    <div v-if="isSubmitted" aria-live="polite" class="flex flex-col gap-4">
      <p class="text-sm text-muted-foreground">
        {{ $t('auth_password.forgot_password_sent') }}
      </p>
      <Button
        type="button"
        variant="outline"
        class="h-10 w-full"
        @click="navigateTo(authRoutes.AUTH_LOGIN)"
      >
        {{ $t('auth.back_to_sign_in') }}
      </Button>
    </div>

    <form v-else class="flex flex-col gap-4" @submit.prevent="onSubmit">
      <VeeField v-slot="{ field, errors }" name="email">
        <Field :data-invalid="!!errors.length">
          <FieldLabel for="forgot-email">{{ $t('common.email') }}</FieldLabel>
          <Input
            id="forgot-email"
            name="email"
            :model-value="field.value"
            type="email"
            autocomplete="email"
            :placeholder="$t('auth_password.email_placeholder')"
            class="h-10"
            :disabled="isSubmitting"
            :aria-invalid="!!errors.length"
            @update:model-value="field.onChange"
          />
          <FieldError
            v-if="errors.length"
            :errors="errors.map((key) => $t($te(key) ? key : 'errors.invalid_field'))"
          />
        </Field>
      </VeeField>

      <FormChallenge :challenge="challenge.challenge" />

      <Button
        type="submit"
        class="h-10 w-full"
        :is-loading="isSubmitting"
        :disabled="challengePending"
      >
        {{ $t('auth_password.forgot_password_send') }}
      </Button>
    </form>

    <p v-if="!isSubmitted" class="text-center text-sm text-muted-foreground">
      <NuxtLink
        :to="authRoutes.AUTH_LOGIN"
        class="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {{ $t('auth.back_to_sign_in') }}
      </NuxtLink>
    </p>
  </AuthPageLayout>
</template>
