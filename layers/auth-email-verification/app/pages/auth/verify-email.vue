<script setup lang="ts">
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { MailCheck } from '@lucide/vue';
import { safeRedirectPath } from '#layers/auth/app/utils/safeRedirect';
import { emailVerificationRoutes } from '../../../shared/emailVerificationRoutes';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const route = useRoute();
const requestUrl = useRequestURL();
const localePath = useAppLocalePath();
const { loggedIn } = useUserSession();

if (loggedIn.value) {
  navigateTo(localePath('/'));
}

const token = computed(() => {
  const val = route.query.token;
  return typeof val === 'string' ? val : '';
});

if (token.value) {
  navigateTo(`/api/auth/verify-email?token=${encodeURIComponent(token.value)}`, {
    external: true,
  });
}

const email = computed(() => {
  const val = route.query.email;
  return typeof val === 'string' ? val : '';
});

const loginLink = computed(() => {
  const redirectTo = typeof route.query.redirectTo === 'string' ? route.query.redirectTo : '';
  const safeRedirectTo = redirectTo ? safeRedirectPath(redirectTo, '', requestUrl.origin) : '';

  const path = localePath(authRoutes.AUTH_LOGIN) || authRoutes.AUTH_LOGIN;
  return safeRedirectTo ? { path, query: { redirectTo: safeRedirectTo } } : { path };
});

const challenge = useFormChallenge();
const { pending: challengePending } = challenge;
const isResending = ref(false);
const resendSuccess = ref(false);
const resendError = ref('');
const { t } = useI18n();

definePageMeta({
  title: 'auth.verify_email_title',
  breadcrumb: 'auth.verify_email_breadcrumb',
  layout: false,
  middleware: ['guest'],
});

useSeo({
  title: computed(() => t('auth.verify_email_title')),
  description: computed(() => t('auth.verify_email_description')),
  type: 'website',
});

async function resendVerification() {
  if (!email.value || isResending.value || challengePending.value) return;

  isResending.value = true;
  resendSuccess.value = false;
  resendError.value = '';

  try {
    const response = await apiRequest<ApiResponse<object>>(
      emailVerificationRoutes.AUTH_RESEND_VERIFICATION,
      {
        method: 'POST',
        headers: challenge.headers(),
        body: { email: email.value },
      },
    );
    if (!response.success) {
      throw response;
    }
    resendSuccess.value = true;
  } catch (err: unknown) {
    const parsed = parseApiError(err, 'Failed to resend verification email. Please try again.');
    resendError.value = challenge.errorMessage(parsed) ?? parsed.message;
  } finally {
    challenge.reset();
    isResending.value = false;
  }
}
</script>

<template>
  <AuthPageLayout page="verify-email">
    <div class="space-y-4">
      <div class="flex size-10 items-center justify-center rounded-md border bg-background/60">
        <MailCheck aria-hidden="true" class="size-5" />
      </div>

      <div class="space-y-1.5">
        <h1 class="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p class="text-sm text-muted-foreground">
          We've sent a verification link to
          <strong v-if="email" class="font-medium text-foreground">{{ email }}</strong>
          <span v-else>your email address</span>. Click the link in the email to verify your
          account. If you don't see it, check your spam folder.
        </p>
      </div>
    </div>

    <Alert
      v-if="resendSuccess"
      role="status"
      class="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
    >
      <AlertDescription class="text-green-700 dark:text-green-300">
        Verification email sent! Please check your inbox.
      </AlertDescription>
    </Alert>

    <Alert v-if="resendError" variant="destructive" role="alert">
      <AlertDescription>{{ resendError }}</AlertDescription>
    </Alert>

    <FormChallenge v-if="email && !resendSuccess" :challenge="challenge.challenge" />

    <Button
      type="button"
      variant="outline"
      class="h-10 w-full"
      :disabled="!email || isResending || resendSuccess || challengePending"
      :is-loading="isResending"
      @click="resendVerification"
    >
      {{ resendSuccess ? 'Email sent' : 'Resend verification email' }}
    </Button>

    <p class="text-center text-sm text-muted-foreground">
      <NuxtLink
        :to="loginLink"
        class="font-medium text-foreground underline-offset-4 hover:underline"
      >
        Back to sign in
      </NuxtLink>
    </p>
  </AuthPageLayout>
</template>
