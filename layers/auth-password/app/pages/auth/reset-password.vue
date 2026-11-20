<script setup lang="ts">
import AuthPageLayout from '#layers/auth/app/components/auth/AuthPageLayout.vue';
import { Eye, EyeOff, KeyRound } from '@lucide/vue';
import { Field as VeeField, useForm } from 'vee-validate';
import { resetPasswordFormSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import { calculatePasswordStrength } from '#layers/auth-password/app/utils/passwordValidation';
import PasswordStrengthIndicator from '#layers/auth-password/app/components/PasswordStrengthIndicator.vue';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import type { PasswordResetData } from '#layers/auth-password/types/authTokens';
import { passwordRoutes } from '#layers/auth-password/shared/passwordRoutes';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const route = useRoute();
const localePath = useAppLocalePath();
const token = computed(() => {
  const val = route.query.token;
  return typeof val === 'string' ? val : '';
});

const showPassword = ref(false);
const showConfirmPassword = ref(false);
const isSubmitting = ref(false);
const error = ref('');
const success = ref(false);
const oauthAccountsDisconnected = ref(false);
const { t } = useI18n();

const { handleSubmit, values, meta } = useForm({
  initialValues: { password: '', confirmPassword: '' },
  validationSchema: resetPasswordFormSchema,
});

const passwordStrength = computed(() => calculatePasswordStrength(values.password || ''));
const isFormValid = computed(() => meta.value.valid && passwordStrength.value.score >= 80);

const onSubmit = handleSubmit(async (formValues) => {
  if (!token.value) {
    error.value = 'Invalid reset link. Please request a new one.';
    return;
  }

  isSubmitting.value = true;
  error.value = '';
  success.value = false;

  try {
    const response = await apiRequest<ApiResponse<PasswordResetData>>(
      passwordRoutes.AUTH_RESET_PASSWORD_REQUEST,
      {
        method: 'POST',
        body: {
          token: token.value,
          password: formValues.password,
          confirmPassword: formValues.confirmPassword,
        },
      },
    );

    if (!response.success) {
      throw response;
    }

    oauthAccountsDisconnected.value = response.data.oauthAccountsDisconnected;
    success.value = true;
  } catch (err: unknown) {
    error.value = parseApiError(err, 'Something went wrong. Please try again.').message;
  } finally {
    isSubmitting.value = false;
  }
});

definePageMeta({
  title: 'auth_password.reset_password_title',
  breadcrumb: 'auth_password.reset_password_breadcrumb',
  layout: false,
  middleware: ['guest'],
});

useSeo({
  title: computed(() => t('auth_password.reset_password_title')),
  description: computed(() => t('auth_password.reset_password_description')),
  type: 'website',
});
</script>

<template>
  <AuthPageLayout page="reset-password">
    <div class="space-y-4">
      <div class="flex size-10 items-center justify-center rounded-md border bg-background/60">
        <KeyRound aria-hidden="true" class="size-5" />
      </div>
      <div class="space-y-1.5">
        <h1 class="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p class="text-sm text-muted-foreground">Enter your new password below.</p>
      </div>
    </div>

    <Alert v-if="error" variant="destructive" role="alert">
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <Alert
      v-if="success"
      role="status"
      class="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
    >
      <AlertDescription class="text-green-700 dark:text-green-300">
        <p>{{ t('auth_password.reset_password_success') }}</p>
        <p v-if="oauthAccountsDisconnected">{{ t('auth_password.reset_password_oauth_disconnected') }}</p>
      </AlertDescription>
    </Alert>

    <Alert v-if="!token" variant="destructive" role="alert">
      <AlertDescription>
        <p>
          This reset link is invalid or has expired.
          <NuxtLink
            :to="localePath(passwordRoutes.AUTH_FORGOT_PASSWORD)"
            class="font-medium underline underline-offset-4"
          >
            Request a new one</NuxtLink
          >.
        </p>
      </AlertDescription>
    </Alert>

    <form v-if="token && !success" class="flex flex-col gap-4" @submit.prevent="onSubmit">
      <VeeField v-slot="{ field, errors }" name="password">
        <Field :data-invalid="!!errors.length">
          <FieldLabel for="new-password">New password</FieldLabel>
          <div class="relative">
            <Input
              id="new-password"
              :model-value="field.value"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Enter new password"
              class="h-10 pr-10"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              autocomplete="new-password"
              @update:model-value="field.onChange"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="absolute inset-y-0 right-0 h-10 w-10 text-muted-foreground hover:bg-transparent hover:text-foreground"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <Eye v-if="!showPassword" aria-hidden="true" class="size-4" />
              <EyeOff v-else aria-hidden="true" class="size-4" />
            </Button>
          </div>
          <FieldError v-if="errors.length" :errors="errors" />
          <PasswordStrengthIndicator
            :password="values.password || ''"
            :strength="passwordStrength"
          />
        </Field>
      </VeeField>

      <VeeField v-slot="{ field, errors }" name="confirmPassword">
        <Field :data-invalid="!!errors.length">
          <FieldLabel for="confirm-new-password">Confirm new password</FieldLabel>
          <div class="relative">
            <Input
              id="confirm-new-password"
              :model-value="field.value"
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="Confirm new password"
              class="h-10 pr-10"
              :disabled="isSubmitting"
              :aria-invalid="!!errors.length"
              autocomplete="new-password"
              @update:model-value="field.onChange"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="absolute inset-y-0 right-0 h-10 w-10 text-muted-foreground hover:bg-transparent hover:text-foreground"
              :aria-label="
                showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'
              "
              :aria-pressed="showConfirmPassword"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <Eye v-if="!showConfirmPassword" aria-hidden="true" class="size-4" />
              <EyeOff v-else aria-hidden="true" class="size-4" />
            </Button>
          </div>
          <FieldError v-if="errors.length" :errors="errors" />
        </Field>
      </VeeField>

      <Button type="submit" class="h-10 w-full" :disabled="!isFormValid" :is-loading="isSubmitting">
        Reset password
      </Button>

      <p
        v-if="values.password && passwordStrength.score < 80"
        class="text-center text-xs text-muted-foreground"
      >
        Password must be strong to reset
      </p>
    </form>

    <p class="text-center text-sm text-muted-foreground">
      <NuxtLink
        :to="localePath(authRoutes.AUTH_LOGIN)"
        class="font-medium text-foreground underline-offset-4 hover:underline"
      >
        Back to sign in
      </NuxtLink>
    </p>
  </AuthPageLayout>
</template>
