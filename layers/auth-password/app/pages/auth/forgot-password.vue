<script setup lang="ts">
import { KeyRound } from '@lucide/vue';
import { Field as VeeField, useForm } from 'vee-validate';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { passwordRoutes } from '#layers/auth-password/shared/passwordRoutes';
import { forgotPasswordFormSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const turnstileToken = ref('');
const isSubmitting = ref(false);
const isSubmitted = ref(false);
const error = ref('');
const { t } = useI18n();

const { handleSubmit } = useForm({
  initialValues: { email: '' },
  validationSchema: forgotPasswordFormSchema,
});

const onSubmit = handleSubmit(async (values) => {
  isSubmitting.value = true;
  error.value = '';

  try {
    const response = await apiRequest<ApiResponse<Record<string, never>>>(
      passwordRoutes.AUTH_FORGOT_PASSWORD_REQUEST,
      {
        method: 'POST',
        body: {
          email: values.email,
          'cf-turnstile-response': turnstileToken.value,
        },
      },
    );
    if (!response.success) {
      throw response;
    }
    isSubmitted.value = true;
  } catch (err: unknown) {
    error.value = parseApiError(err, 'Something went wrong. Please try again.').message;
  } finally {
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
        <h1 class="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p class="text-sm text-muted-foreground">
          {{
            isSubmitted
              ? 'Check your email for a reset link.'
              : "Enter your email and we'll send you a reset link."
          }}
        </p>
      </div>
    </div>

    <Alert v-if="error" variant="destructive" role="alert">
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <div v-if="isSubmitted" aria-live="polite" class="flex flex-col gap-4">
      <p class="text-sm text-muted-foreground">
        If an account exists with that email, we've sent a password reset link. Check your inbox and
        spam folder. The link expires in 1 hour.
      </p>
      <Button
        type="button"
        variant="outline"
        class="h-10 w-full"
        @click="navigateTo(authRoutes.AUTH_LOGIN)"
      >
        Back to sign in
      </Button>
    </div>

    <form v-else class="flex flex-col gap-4" @submit.prevent="onSubmit">
      <VeeField v-slot="{ field, errors }" name="email">
        <Field :data-invalid="!!errors.length">
          <FieldLabel for="forgot-email">Email</FieldLabel>
          <Input
            id="forgot-email"
            name="email"
            :model-value="field.value"
            type="email"
            autocomplete="email"
            placeholder="Enter your email address"
            class="h-10"
            :disabled="isSubmitting"
            :aria-invalid="!!errors.length"
            @update:model-value="field.onChange"
          />
          <FieldError v-if="errors.length" :errors="errors" />
        </Field>
      </VeeField>

      <NuxtTurnstile
        v-model="turnstileToken"
        :options="{ size: 'flexible', appearance: 'interaction-only' }"
      />

      <Button
        type="submit"
        class="h-10 w-full"
        :is-loading="isSubmitting"
        :disabled="!turnstileToken"
      >
        Send reset link
      </Button>
    </form>

    <p v-if="!isSubmitted" class="text-center text-sm text-muted-foreground">
      <NuxtLink
        :to="authRoutes.AUTH_LOGIN"
        class="font-medium text-foreground underline-offset-4 hover:underline"
      >
        Back to sign in
      </NuxtLink>
    </p>
  </AuthPageLayout>
</template>
