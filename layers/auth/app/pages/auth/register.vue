<script setup lang="ts">
import AuthPageLayout from '#layers/auth/app/components/auth/AuthPageLayout.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff } from '@lucide/vue';
import PasswordStrengthIndicator from '#layers/auth/app/components/PasswordStrengthIndicator.vue';
import { registerUserSchema } from '#layers/auth/shared/schemas/userSchema';
import { calculatePasswordStrength } from '#layers/auth/app/utils/passwordValidation';
import { getAuthErrorMessage } from '#layers/auth/shared/constants/authMessages';
import { AVAILABLE_PROVIDERS } from '#layers/auth/shared/constants/oauthProviders';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import { Field as VeeField, useForm } from 'vee-validate';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import type { ApiResponse } from '#layers/server-core/types/api';
import type { OAuthUrlPayload } from '#layers/auth/types/auth';

const siteConfig = useConfig();
const route = useRoute();
const requestUrl = useRequestURL();
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const isLoading = ref(false);
const error = ref('');
const turnstileToken = ref('');
const oauthLoadingProvider = ref<string | null>(null);
const oauthPopup = ref<Window | null>(null);
const oauthPopupTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const oauthPopupCloseMonitor = ref<ReturnType<typeof setInterval> | null>(null);
const { t } = useI18n();

const redirectTo = computed(() => {
  const value = getQueryString(route.query.redirectTo);
  if (!value) {
    return '/';
  }

  try {
    const parsed = new URL(value, requestUrl.origin);
    if (parsed.origin !== requestUrl.origin) {
      return '/';
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
});

function stopOAuthPopupTimeout() {
  if (oauthPopupTimeout.value) {
    clearTimeout(oauthPopupTimeout.value);
    oauthPopupTimeout.value = null;
  }
}

function stopOAuthPopupCloseMonitor() {
  if (oauthPopupCloseMonitor.value) {
    clearInterval(oauthPopupCloseMonitor.value);
    oauthPopupCloseMonitor.value = null;
  }
}

function onOAuthPopupComplete(message: { url: string }) {
  stopOAuthPopupCloseMonitor();
  stopOAuthPopupTimeout();
  oauthPopup.value = null;
  oauthLoadingProvider.value = null;

  let target: URL;
  try {
    target = new URL(message.url);
  } catch {
    error.value = 'Authentication completed but response URL was invalid. Please try again.';
    return;
  }

  window.location.assign(`${target.pathname}${target.search}${target.hash}`);
}

const oauthPopupListener = useOAuthPopupListener(onOAuthPopupComplete);

const form = useForm({
  initialValues: {
    username: '',
    name: '',
    email: '',
    password: '',
    'confirm-password': '',
    'cf-turnstile-response': '',
  },
  validationSchema: registerUserSchema,
});

const { handleSubmit, values, meta, setFieldValue } = form;

definePageMeta({
  title: 'auth.register_title',
  breadcrumb: 'auth.register_breadcrumb',
  layout: false,
});

useSeo({
  title: computed(() => t('auth.register_title')),
  description: computed(() => t('auth.register_description')),
  type: 'website',
});

const onSubmit = handleSubmit(async () => {
  const formEl = document.querySelector(`form[action="${authRoutes.AUTH_REGISTER_PASSWORD}"]`);
  if (formEl instanceof HTMLFormElement) formEl.submit();
});

watch(turnstileToken, (val) => {
  setFieldValue('cf-turnstile-response', val);
});

const passwordStrength = computed(() => calculatePasswordStrength(values.password || ''));

// Check if form is valid for submission
const isFormValid = computed(() => {
  return meta.value.valid && passwordStrength.value.score >= 80;
});

watch(
  () => route.query.error,
  (queryValue) => {
    const errorCode = getQueryString(queryValue);
    if (errorCode) {
      error.value = getAuthErrorMessage(errorCode) || 'An error occurred during registration';
    }
  },
  { immediate: true },
);

onMounted(() => {
  oauthPopupListener.start();
});

async function signUpWithProvider(provider: string) {
  if (oauthLoadingProvider.value) return;

  oauthLoadingProvider.value = provider;
  error.value = '';

  try {
    const response = await apiRequest<ApiResponse<OAuthUrlPayload>>(authRoutes.AUTH_OAUTH_URL, {
      method: 'POST',
      body: { provider, action: 'login', redirectTo: redirectTo.value },
    });
    if (!response.success) {
      throw response;
    }

    const popupWidth = Math.min(560, window.outerWidth - 40);
    const popupHeight = Math.min(720, window.outerHeight - 80);
    const popupLeft = window.screenX + Math.max(0, (window.outerWidth - popupWidth) / 2);
    const popupTop = window.screenY + Math.max(0, (window.outerHeight - popupHeight) / 2);
    const popup = window.open(
      response.data.url,
      `oauth-${provider}`,
      `width=${popupWidth},height=${popupHeight},left=${popupLeft},top=${popupTop},location=0,resizable,scrollbars,toolbar=0,menubar=0,popup=true`,
    );

    if (!popup) {
      throw new Error('Popup blocked');
    }

    popup.focus();
    oauthPopup.value = popup;
    stopOAuthPopupCloseMonitor();
    stopOAuthPopupTimeout();

    oauthPopupCloseMonitor.value = setInterval(() => {
      if (!oauthPopup.value) {
        stopOAuthPopupCloseMonitor();
        return;
      }

      let isClosed = false;
      try {
        isClosed = oauthPopup.value.closed;
      } catch {
        return;
      }

      if (!isClosed) {
        return;
      }

      stopOAuthPopupCloseMonitor();
      stopOAuthPopupTimeout();
      oauthPopup.value = null;
      oauthLoadingProvider.value = null;
    }, 500);

    oauthPopupTimeout.value = setTimeout(() => {
      stopOAuthPopupCloseMonitor();
      stopOAuthPopupTimeout();
      oauthPopup.value = null;
      oauthLoadingProvider.value = null;
      error.value = 'OAuth session timed out or popup was closed. Please try again.';
    }, 120000);
  } catch (err) {
    stopOAuthPopupCloseMonitor();
    stopOAuthPopupTimeout();
    oauthPopup.value = null;
    error.value = parseApiError(
      err,
      'Unable to continue with provider right now. Please try again.',
    ).message;
    oauthLoadingProvider.value = null;
  }
}

onBeforeUnmount(() => {
  stopOAuthPopupCloseMonitor();
  stopOAuthPopupTimeout();
  oauthPopupListener.stop();
});
</script>

<template>
  <AuthPageLayout page="register">
    <div class="space-y-1.5">
      <h1 class="text-2xl font-semibold tracking-tight">Create an account</h1>
      <p class="text-sm text-muted-foreground">Get started with {{ siteConfig.site.name }}.</p>
    </div>

    <Alert v-if="error" variant="destructive" role="alert">
      <AlertDescription>{{ error }}</AlertDescription>
    </Alert>

    <div v-if="AVAILABLE_PROVIDERS.length" class="flex flex-col gap-2">
      <Button
        v-for="provider in AVAILABLE_PROVIDERS"
        :key="provider.id"
        type="button"
        variant="outline"
        class="h-10 w-full"
        :is-loading="oauthLoadingProvider === provider.id"
        :disabled="isLoading || oauthLoadingProvider !== null"
        @click="signUpWithProvider(provider.id)"
      >
        <div class="flex size-4 items-center justify-center">
          <OAuthIcon :provider="provider.id" />
        </div>
        Continue with {{ provider.name }}
      </Button>
    </div>

    <div v-if="AVAILABLE_PROVIDERS.length" class="flex items-center gap-3">
      <div class="h-px flex-1 bg-border" />
      <span class="text-xs text-muted-foreground">or</span>
      <div class="h-px flex-1 bg-border" />
    </div>

    <form
      :action="authRoutes.AUTH_REGISTER_PASSWORD"
      method="POST"
      class="flex flex-col gap-4"
      @submit.prevent="onSubmit"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <VeeField v-slot="{ field, errors }" name="username">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="username">Username</FieldLabel>
            <Input
              id="username"
              :model-value="field.value"
              name="username"
              type="text"
              autocomplete="username"
              autocapitalize="none"
              :spellcheck="false"
              placeholder="Enter your username"
              class="h-10"
              :aria-invalid="!!errors.length"
              :disabled="isLoading"
              @update:model-value="field.onChange"
            />
            <FieldError v-if="errors.length" :errors="errors" />
          </Field>
        </VeeField>

        <VeeField v-slot="{ field, errors }" name="name">
          <Field :data-invalid="!!errors.length">
            <FieldLabel for="name">Display name</FieldLabel>
            <Input
              id="name"
              :model-value="field.value"
              name="name"
              type="text"
              autocomplete="name"
              placeholder="Enter your display name"
              class="h-10"
              :aria-invalid="!!errors.length"
              :disabled="isLoading"
              @update:model-value="field.onChange"
            />
            <FieldError v-if="errors.length" :errors="errors" />
          </Field>
        </VeeField>
      </div>

      <VeeField v-slot="{ field, errors }" name="email">
        <Field :data-invalid="!!errors.length">
          <FieldLabel for="email">Email</FieldLabel>
          <Input
            id="email"
            :model-value="field.value"
            name="email"
            type="email"
            autocomplete="email"
            placeholder="Enter your email"
            class="h-10"
            :aria-invalid="!!errors.length"
            :disabled="isLoading"
            @update:model-value="field.onChange"
          />
          <FieldError v-if="errors.length" :errors="errors" />
        </Field>
      </VeeField>

      <div class="flex flex-col gap-2">
        <div class="grid gap-4 sm:grid-cols-2">
          <VeeField v-slot="{ field, errors }" name="password">
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="password">Password</FieldLabel>
              <div class="relative">
                <Input
                  id="password"
                  :model-value="field.value"
                  name="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="Create a password"
                  class="h-10 pr-10"
                  :aria-invalid="!!errors.length"
                  :disabled="isLoading"
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
            </Field>
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="confirm-password">
            <Field :data-invalid="!!errors.length">
              <FieldLabel for="confirmPassword">Confirm password</FieldLabel>
              <div class="relative">
                <Input
                  id="confirmPassword"
                  :model-value="field.value"
                  name="confirm-password"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="Repeat password"
                  class="h-10 pr-10"
                  :aria-invalid="!!errors.length"
                  :disabled="isLoading"
                  @update:model-value="field.onChange"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="absolute inset-y-0 right-0 h-10 w-10 text-muted-foreground hover:bg-transparent hover:text-foreground"
                  :aria-label="
                    showConfirmPassword
                      ? 'Hide password confirmation'
                      : 'Show password confirmation'
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
        </div>
        <PasswordStrengthIndicator :password="values.password || ''" :strength="passwordStrength" />
      </div>

      <NuxtTurnstile
        v-model="turnstileToken"
        :options="{ size: 'flexible', appearance: 'interaction-only' }"
      />
      <input type="hidden" name="redirect-to" :value="redirectTo" />
      <Button type="submit" class="h-10 w-full" :disabled="!isFormValid" :is-loading="isLoading">
        Create account
      </Button>
      <p
        v-if="values.password && passwordStrength.score < 80"
        class="text-center text-xs text-muted-foreground"
      >
        Password must be strong to create an account
      </p>
    </form>

    <div class="space-y-3">
      <p class="text-center text-sm text-muted-foreground">
        Already have an account?
        <NuxtLink
          to="/auth/login"
          class="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </NuxtLink>
      </p>

      <p class="text-center text-xs text-muted-foreground text-balance">
        By creating an account, you agree to our
        <NuxtLink
          to="https://nnsvn.me/terms"
          class="underline underline-offset-4 hover:text-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms of Service
        </NuxtLink>
        and
        <NuxtLink
          to="https://nnsvn.me/privacy"
          class="underline underline-offset-4 hover:text-foreground"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </NuxtLink>
      </p>
    </div>
  </AuthPageLayout>
</template>
