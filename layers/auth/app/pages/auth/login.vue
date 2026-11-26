<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import { Skeleton } from '@/components/ui/skeleton';
import {
  forgetLastSignIn,
  getLastSignInStorage,
  LAST_SIGN_IN_KEY,
  readLastSignIn,
} from '#layers/auth/app/utils/lastSignIn';
import { getQueryString, safeRedirectPath } from '#layers/auth/app/utils/safeRedirect';
import type { LastSignIn, LastSignInMode } from '#layers/auth/types/lastSignIn';
import {
  getAuthErrorMessage,
  getAuthSuccessMessage,
} from '#layers/auth/shared/constants/authMessages';

const route = useRoute();
const requestUrl = useRequestURL();
const isDev = import.meta.dev;
const isLoading = ref(false);
const { t, te } = useI18n();
const methodError = ref('');
const errorCode = ref('');
const successKey = ref('');
const error = computed(
  () =>
    getAuthErrorMessage(errorCode.value, t) ??
    (te(methodError.value) ? t(methodError.value) : methodError.value),
);
const success = computed(() =>
  successKey.value && te(successKey.value) ? t(successKey.value) : successKey.value,
);

const lastSignIn = shallowRef<LastSignIn | null>(null);
const mounted = ref(false);
const signInMode = ref<LastSignInMode>('auto');
const signInPanel = useTemplateRef<HTMLElement>('signInPanel');
const rememberedMethod = computed(() => {
  if (signInMode.value !== 'auto' || error.value || success.value) return undefined;
  return getExtensions('auth:login:remembered').find(
    (entry) => entry.id === lastSignIn.value?.method,
  );
});

function refreshLastSignIn() {
  lastSignIn.value = readLastSignIn(getLastSignInStorage());
}

useEventListener('storage', (event: StorageEvent) => {
  if (event.key === LAST_SIGN_IN_KEY && event.storageArea === getLastSignInStorage())
    refreshLastSignIn();
});

onMounted(() => {
  refreshLastSignIn();
  mounted.value = true;
});

async function showFullForm() {
  signInMode.value = 'form';
  await nextTick();
  const target =
    signInPanel.value?.querySelector<HTMLElement>('input[autocomplete="username"]') ??
    signInPanel.value?.querySelector<HTMLElement>('button');
  target?.focus({ preventScroll: true });
}

function forgetDevice() {
  forgetLastSignIn(getLastSignInStorage());
  lastSignIn.value = null;
  void showFullForm();
}

async function returnToLastSignIn() {
  signInMode.value = 'auto';
  await nextTick();
  signInPanel.value
    ?.querySelector<HTMLElement>('[data-last-sign-in-continue]')
    ?.focus({ preventScroll: true });
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

const redirectTo = computed(() => safeRedirectPath(route.query.redirectTo, '/', requestUrl.origin));

/**
 * The registered login step `?step=` names, e.g. a second-factor challenge. It
 * replaces the sign-in methods until it signs the user in or is cancelled.
 */
const activeLoginStep = computed(() => {
  const step = getQueryString(route.query.step);
  return step ? getExtensions('auth:login:steps').find((entry) => entry.id === step) : undefined;
});

function completeLogin(redirect: string) {
  window.location.href = safeRedirectPath(redirect, '/', requestUrl.origin);
}

function leaveLoginStep() {
  const q = { ...route.query };
  delete q.step;
  navigateTo({ query: q });
}

function onMethodPending(pending: boolean) {
  isLoading.value = pending;
  if (pending) {
    errorCode.value = '';
    methodError.value = '';
  }
}

function onMethodError(message: string) {
  errorCode.value = '';
  methodError.value = message;
}

watch(
  () => route.query.error,
  (queryValue) => {
    const code = getQueryString(queryValue);
    if (code) {
      errorCode.value = code;
      successKey.value = '';
    }
  },
  { immediate: true },
);

watch(
  () => route.query.success,
  (queryValue) => {
    const successCode = getQueryString(queryValue);
    if (successCode) {
      successKey.value = getAuthSuccessMessage(successCode) ?? '';
      errorCode.value = '';
      methodError.value = '';
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
        <h1 class="text-2xl font-semibold tracking-tight">{{ $t('auth.welcome_back') }}</h1>
        <p class="text-sm text-muted-foreground">
          {{ $t('auth.login_description') }}
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

      <div ref="signInPanel" class="flex flex-col gap-4">
        <Skeleton
          v-if="!mounted && !error && !success"
          class="min-h-52 motion-reduce:animate-none"
          aria-hidden="true"
        />
        <component
          :is="rememberedMethod.component"
          v-else-if="rememberedMethod && lastSignIn"
          :key="rememberedMethod.id"
          :record="lastSignIn"
          :redirect-to="redirectTo"
          :pending="isLoading"
          @done="completeLogin"
          @pending="onMethodPending"
          @error="onMethodError"
          @alternate="showFullForm"
          @forget="forgetDevice"
          @unavailable="showFullForm"
          @continue-password="signInMode = 'password'"
        />
        <template v-else>
          <Button
            v-if="signInMode === 'password' && lastSignIn?.method === 'password'"
            type="button"
            variant="ghost"
            size="sm"
            class="self-start text-muted-foreground motion-reduce:transition-none"
            :disabled="isLoading"
            @click="returnToLastSignIn"
          >
            <ArrowLeft aria-hidden="true" />
            {{ $t('common.back') }}
          </Button>
          <ExtensionSlot
            name="auth:login:methods"
            mode="login"
            :remembered-username="signInMode === 'password' ? lastSignIn?.username : undefined"
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
        </template>
      </div>

      <div class="space-y-3">
        <ExtensionSlot name="auth:login:footer" />

        <i18n-t
          keypath="auth.sign_in_agreement"
          tag="p"
          class="text-center text-xs text-muted-foreground text-balance"
        >
          <template #terms>
            <NuxtLink
              to="https://nnsvn.me/terms"
              class="underline underline-offset-4 hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ $t('auth.terms_of_service') }}
            </NuxtLink>
          </template>
          <template #privacy>
            <NuxtLink
              to="https://nnsvn.me/privacy"
              class="underline underline-offset-4 hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ $t('auth.privacy_policy') }}
            </NuxtLink>
          </template>
        </i18n-t>
      </div>
    </template>
  </AuthPageLayout>
</template>
