<script setup lang="ts">
import { ArrowLeft, Eye, EyeOff } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import { Skeleton } from '@/components/ui/skeleton';
import AuthLastSignInTile from '#layers/auth/app/components/auth/AuthLastSignInTile.vue';
import {
  chooseLastSignInView,
  forgetLastSignIn,
  getLastSignInStorage,
  LAST_SIGN_IN_KEY,
  readLastSignIn,
} from '#layers/auth/app/utils/lastSignIn';
import type { LastSignIn, LastSignInMode } from '#layers/auth/types/lastSignIn';
import { getQueryString, safeRedirectPath } from '#layers/auth/app/utils/safeRedirect';
import {
  getAuthErrorMessage,
  getAuthSuccessMessage,
} from '#layers/auth/shared/constants/authMessages';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { Field as VeeField, useForm } from 'vee-validate';
import { loginSchema } from '#layers/auth/shared/schemas/userSchema';
import { parseApiError } from '#layers/server-core/app/utils/apiError';

const siteConfig = useConfig();
const formSchema = loginSchema.pick({ username: true, password: true });

const route = useRoute();
const hasNoticeQuery = computed(() => route.query.error !== undefined || route.query.success !== undefined);
const requestUrl = useRequestURL();
const showPassword = ref(false);
const isLoading = ref(false);
const error = ref('');
const success = ref('');
const turnstileToken = ref('');
const { t, te } = useI18n();
const { data: oauthProviders, error: oauthProvidersError, status: oauthProvidersStatus } = useOAuthProviders();
const loginForm = useTemplateRef<HTMLFormElement>('loginForm');
const signInPanel = useTemplateRef<HTMLDivElement>('signInPanel');
const mounted = ref(false);
const lastSignIn = shallowRef<LastSignIn | null>(null);
const signInMode = ref<LastSignInMode>('auto');
const passkeyAlternative = computed(() => getExtensions('auth:login:alternatives')
  .find((entry) => entry.rememberedSignInMethod === 'passkey')?.component);
const lastSignInProvider = computed(() => {
  const record = lastSignIn.value;
  return record?.method === 'oauth'
    ? oauthProviders.value.find((provider) => provider.id === record.provider)
    : undefined;
});
const lastSignInView = computed(() => chooseLastSignInView({
  mounted: mounted.value,
  hasStep: route.query.step !== undefined,
  hasMessage: hasNoticeQuery.value || Boolean(error.value || success.value),
  mode: signInMode.value,
  record: lastSignIn.value,
  providerStatus: oauthProvidersStatus.value,
  providerEnabled: Boolean(lastSignInProvider.value),
  passkeyAvailable: Boolean(passkeyAlternative.value),
}));

onMounted(() => {
  lastSignIn.value = readLastSignIn(getLastSignInStorage());
  mounted.value = true;
});
useEventListener('storage', (event) => {
  if (event.key === LAST_SIGN_IN_KEY || event.key === null) {
    lastSignIn.value = readLastSignIn(getLastSignInStorage());
  }
});
const { activeProvider: oauthLoadingProvider, open: openOAuthPopup } = useOAuthPopup({
  onBlocked: () => { error.value = t('auth.oauth_popup_blocked'); },
  onTimeout: () => { error.value = t('auth.oauth_popup_timeout'); },
  onError(cause) {
    const { message } = parseApiError(cause, 'auth.oauth_popup_start_failed');
    error.value = te(message) ? t(message) : message;
  },
});

definePageMeta({
  title: 'auth.login_title',
  breadcrumb: 'auth.login_breadcrumb',
  layout: false,
});

useSeo({
  title: computed(() => t('auth.login_title')),
  description: computed(() => t('auth.login_description')),
  type: 'website',
});

const { handleSubmit, resetForm, setFieldValue, values } = useForm({
  initialValues: {
    username: '',
    password: '',
  },
  validationSchema: formSchema,
});

const onSubmit = handleSubmit(async () => {
  // Native form submission for server-side auth
  loginForm.value?.submit();
});

const redirectTo = computed(() =>
  safeRedirectPath(route.query.redirectTo, '/', requestUrl.origin),
);

/**
 * The registered login step `?step=` names, e.g. a second-factor challenge. It
 * replaces the password form until it signs the user in or is cancelled.
 */
const activeLoginStep = computed(() => {
  const step = getQueryString(route.query.step);
  return step && !hasNoticeQuery.value ? getExtensions('auth:login:steps').find((entry) => entry.id === step) : undefined;
});

function completeLogin(redirect: string) {
  window.location.href = safeRedirectPath(redirect, '/', requestUrl.origin);
}

function leaveLoginStep() {
  const q = { ...route.query };
  delete q.step;
  navigateTo({ query: q });
}

// An alternative sign-in holds the form while it runs and
// reports failures through the page's error alert.
function onAlternativePending(pending: boolean) {
  isLoading.value = pending;
  if (pending) {
    error.value = '';
  }
}

function onAlternativeError(message: string) {
  error.value = message;
}

watch(
  () => route.query.error,
  (queryValue) => {
    const errorCode = getQueryString(queryValue);
    if (errorCode) {
      error.value = getAuthErrorMessage(errorCode, t) ?? '';
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

async function focusField(name: 'username' | 'password') {
  await nextTick();
  const field = loginForm.value?.elements.namedItem(name);
  if (field instanceof HTMLInputElement) field.focus({ preventScroll: true });
}

function showFullForm() {
  signInMode.value = 'form';
  void focusField('username');
}

function forgetDevice() {
  forgetLastSignIn(getLastSignInStorage());
  lastSignIn.value = null;
  showFullForm();
}

async function returnToLastSignIn() {
  resetForm();
  showPassword.value = false;
  signInMode.value = 'auto';
  await nextTick();
  const tile = signInPanel.value?.querySelector<HTMLButtonElement>('[data-last-sign-in-continue]');
  tile?.focus({ preventScroll: true });
}

function continueLastSignIn() {
  const record = lastSignIn.value;
  if (!record) return showFullForm();
  if (record.method === 'password') {
    signInMode.value = 'password';
    setFieldValue('username', record.username, false);
    return focusField('password');
  }
  if (record.method === 'oauth' && lastSignInProvider.value) {
    return signInWithProvider(record.provider);
  }
  return showFullForm();
}

function signInWithProvider(provider: string) {
  if (oauthLoadingProvider.value) return;
  error.value = '';
  return openOAuthPopup(provider, redirectTo.value);
}
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

      <Skeleton v-if="lastSignInView === 'placeholder'" class="min-h-52 motion-reduce:animate-none" aria-hidden="true" />
      <div v-else-if="lastSignInView === 'tile' && lastSignIn" ref="signInPanel" class="min-h-52">
        <component
          :is="passkeyAlternative"
          v-if="lastSignIn.method === 'passkey' && passkeyAlternative"
          v-slot="{ signIn }"
          :username="lastSignIn.username"
          :redirect-to="redirectTo"
          :pending="isLoading"
          @done="completeLogin"
          @pending="onAlternativePending"
          @error="onAlternativeError"
        >
          <AuthLastSignInTile
            :record="lastSignIn"
            :pending="isLoading"
            @continue="signIn"
            @alternate="showFullForm"
            @forget="forgetDevice"
          />
        </component>
        <AuthLastSignInTile
          v-else
          :record="lastSignIn"
          :provider="lastSignInProvider"
          :pending="Boolean(oauthLoadingProvider)"
          @continue="continueLastSignIn"
          @alternate="showFullForm"
          @forget="forgetDevice"
        />
      </div>
      <template v-else>
        <Button
          v-if="signInMode === 'password' && lastSignIn?.method === 'password'"
          type="button"
          variant="ghost"
          size="sm"
          class="self-start text-muted-foreground motion-reduce:transition-none"
          @click="returnToLastSignIn"
        >
          <ArrowLeft aria-hidden="true" />
          {{ $t('common.back') }}
        </Button>

        <p v-if="oauthProvidersError" class="text-sm text-muted-foreground" role="status">
          {{ t('auth.oauth_unavailable') }}
        </p>

        <div v-if="oauthProviders.length" class="flex flex-col gap-2">
          <Button
            v-for="provider in oauthProviders"
            :key="provider.id"
            type="button"
            variant="outline"
            class="h-10 w-full"
            :is-loading="oauthLoadingProvider === provider.id"
            :disabled="isLoading || !!oauthLoadingProvider"
            @click="signInWithProvider(provider.id)"
          >
            <div class="flex size-4 items-center justify-center">
              <OAuthIcon :icon="provider.icon" />
            </div>
            {{ t('auth.oauth_continue_with', { provider: provider.name }) }}
          </Button>
        </div>

        <div v-if="oauthProviders.length" class="flex items-center gap-3">
          <div class="h-px flex-1 bg-border" />
          <span class="text-xs text-muted-foreground">{{ t('auth.oauth_or') }}</span>
          <div class="h-px flex-1 bg-border" />
        </div>

        <form
          ref="loginForm"
          :action="authRoutes.AUTH_LOGIN_PASSWORD"
          method="POST"
          class="flex flex-col gap-4"
          @submit.prevent="onSubmit"
        >
          <input type="hidden" name="redirect-to" :value="redirectTo" />
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
                :disabled="isLoading"
                :aria-invalid="!!errors.length"
                @update:model-value="field.onChange"
              />
              <FieldError v-if="errors.length" :errors="errors" />
            </Field>
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="password">
            <Field :data-invalid="!!errors.length">
              <div class="flex items-center justify-between">
                <FieldLabel for="password">Password</FieldLabel>
                <NuxtLink
                  :to="{ path: '/auth/forgot-password' }"
                  class="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {{ $t('auth.forgot_password') }}
                </NuxtLink>
              </div>
              <div class="relative">
                <Input
                  id="password"
                  :model-value="field.value"
                  name="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="Enter your password"
                  class="h-10 pr-10"
                  :disabled="isLoading"
                  :aria-invalid="!!errors.length"
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
            </Field>
          </VeeField>

          <NuxtTurnstile
            v-model="turnstileToken"
            :options="{ size: 'flexible', appearance: 'interaction-only' }"
          />

          <Button type="submit" class="h-10 w-full" :is-loading="isLoading">Sign in</Button>

          <ExtensionSlot
            name="auth:login:alternatives"
            :username="values.username ?? ''"
            :redirect-to="redirectTo"
            :pending="isLoading"
            @done="completeLogin"
            @pending="onAlternativePending"
            @error="onAlternativeError"
          />
        </form>

        <div class="space-y-3">
          <p class="text-center text-sm text-muted-foreground">
            Don't have an account?
            <NuxtLink
              to="/auth/register"
              class="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign up
            </NuxtLink>
          </p>

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
    </template>
  </AuthPageLayout>
</template>
