<script setup lang="ts">
import {
  getAuthErrorMessage,
  getAuthSuccessMessage,
} from '#layers/auth/shared/constants/authMessages';

const siteConfig = useConfig();
const route = useRoute();
const requestUrl = useRequestURL();
const isDev = import.meta.dev;
const isLoading = ref(false);
const error = ref('');
const success = ref('');
const { t } = useI18n();

function safeRedirectPath(value: string, baseUrl: string) {
  try {
    const parsed = new URL(value, baseUrl);
    if (parsed.origin !== baseUrl) {
      return '/';
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

definePageMeta({
  title: 'auth.login_title',
  breadcrumb: 'auth.login_breadcrumb',
  layout: false,
  middleware: ['guest'],
});

useSeo({
  title: computed(() => t('auth.login_title')),
  description: computed(() => t('auth.login_description')),
  type: 'website',
});

const redirectTo = computed(() =>
  safeRedirectPath(getQueryString(route.query.redirectTo) || '/', requestUrl.origin),
);

/**
 * The registered login step `?step=` names, e.g. a second-factor challenge. It
 * replaces the sign-in methods until it signs the user in or is cancelled.
 */
const activeLoginStep = computed(() => {
  const step = getQueryString(route.query.step);
  return step ? getExtensions('auth:login:steps').find((entry) => entry.id === step) : undefined;
});

function completeLogin(redirect: string) {
  window.location.href = safeRedirectPath(redirect, requestUrl.origin);
}

function leaveLoginStep() {
  const q = { ...route.query };
  delete q.step;
  navigateTo({ query: q });
}

function onMethodPending(pending: boolean) {
  isLoading.value = pending;
  if (pending) {
    error.value = '';
  }
}

function onMethodError(message: string) {
  error.value = message;
}

watch(
  () => route.query.error,
  (queryValue) => {
    const errorCode = getQueryString(queryValue);
    if (errorCode) {
      error.value = getAuthErrorMessage(errorCode, t) || 'An error occurred during login';
      success.value = '';
    }
  },
  { immediate: true },
);

watch(
  () => route.query.success,
  (queryValue) => {
    const successCode = getQueryString(queryValue);
    if (successCode) {
      success.value = getAuthSuccessMessage(successCode) ?? '';
      error.value = '';
    }
  },
  { immediate: true },
);
</script>

<template>
  <AuthPageLayout page="login">
    <component
      :is="activeLoginStep.component"
      v-if="activeLoginStep"
      :redirect-to="redirectTo"
      @done="completeLogin"
      @cancel="leaveLoginStep"
    />
    <template v-else>
      <div class="space-y-1.5">
        <h1 class="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p class="text-sm text-muted-foreground">
          {{ siteConfig.site.description }}
        </p>
      </div>

      <Alert
        v-if="success"
        role="status"
        class="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
      >
        <AlertDescription class="text-green-700 dark:text-green-300">
          {{ success }}
        </AlertDescription>
      </Alert>

      <Alert v-if="error" variant="destructive" role="alert">
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>

      <ExtensionSlot
        name="auth:login:methods"
        mode="login"
        :redirect-to="redirectTo"
        :pending="isLoading"
        @done="completeLogin"
        @pending="onMethodPending"
        @error="onMethodError"
      >
        <div role="status" class="space-y-1 text-sm text-muted-foreground">
          <p>{{ $t('auth.no_sign_in_methods') }}</p>
          <p v-if="isDev">{{ $t('auth.no_sign_in_methods_hint') }}</p>
        </div>
        <template #between>
          <AuthMethodDivider />
        </template>
      </ExtensionSlot>

      <div class="space-y-3">
        <ExtensionSlot name="auth:login:footer" />

        <p class="text-center text-xs text-muted-foreground text-balance">
          By signing in, you agree to our
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
    </template>
  </AuthPageLayout>
</template>
