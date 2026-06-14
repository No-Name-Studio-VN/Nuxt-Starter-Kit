<script setup lang="ts">
import AuthPageLayout from '@/components/auth/AuthPageLayout.vue'
import { useOAuthPopup } from '@/composables/useOAuthPopup'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { getAuthErrorMessage, getAuthSuccessMessage } from '#shared/constants/authMessages'
import { AVAILABLE_PROVIDERS } from '#shared/constants/oauthProviders'
import { apiRoutes } from '#shared/apiRoutes'
import { loginSchema } from '#shared/schemas/userSchema'
import { loginTwoFactorSchema } from '#shared/schemas/userSecuritySchema'
import { apiRequest } from '@/utils/apiRequest'
import { parseApiError } from '@/utils/apiError'
import { getQueryString, safeRedirectPath } from '@/utils/safeRedirect'
import { Field as VeeField, useForm } from 'vee-validate'
import { Eye, EyeOff, Fingerprint, Lock, ShieldCheck, User } from '@lucide/vue'
import type { ApiResponse } from '~~/types/api'
import type { LoginTwoFactorValidationPayload } from '~~/types/userSecurity'

const formSchema = loginSchema.pick({ username: true, password: true })

const { authenticate } = useWebAuthn()
const route = useRoute()
const showPassword = ref(false)
const isLoading = ref(false)
const error = ref('')
const successMessage = ref('')
const turnstileToken = ref('')
const passwordForm = ref<HTMLFormElement | null>(null)

const redirectTo = computed(() => safeRedirectPath(route.query.redirectTo))
const isTwoFactorStep = computed(() => getQueryString(route.query.step) === '2fa')

const loginForm = useForm({
  initialValues: {
    username: '',
    password: '',
  },
  validationSchema: formSchema,
})

const { handleSubmit: handlePasswordSubmit, values } = loginForm

const twoFactorForm = useForm({
  initialValues: {
    code: '',
  },
  validationSchema: loginTwoFactorSchema,
})

const { handleSubmit: handleTwoFactorSubmit, setFieldError: setTwoFactorFieldError } = twoFactorForm

const { oauthLoadingProvider, startOAuth } = useOAuthPopup({
  onError(message) {
    error.value = message
  },
})

const onPasswordSubmit = handlePasswordSubmit(async () => {
  isLoading.value = true
  passwordForm.value?.submit()
})

const onTwoFactorSubmit = handleTwoFactorSubmit(async (formValues) => {
  isLoading.value = true
  error.value = ''

  try {
    const response = await apiRequest<ApiResponse<LoginTwoFactorValidationPayload>>(apiRoutes.AUTH_LOGIN_2FA, {
      method: 'POST',
      body: formValues,
    })

    if (!response.success) {
      throw response.error
    }

    await navigateTo(redirectTo.value)
  }
  catch (err: unknown) {
    const parsedError = parseApiError(err, 'Unable to verify your code. Please try again.')
    setTwoFactorFieldError('code', parsedError.message)
    error.value = parsedError.message
    isLoading.value = false
  }
})

watch(() => route.query.error, (queryValue) => {
  const errorCode = getQueryString(queryValue)
  error.value = getAuthErrorMessage(errorCode) || ''
}, { immediate: true })

watch(() => route.query.success, (queryValue) => {
  const successCode = getQueryString(queryValue)
  successMessage.value = getAuthSuccessMessage(successCode) || ''
}, { immediate: true })

async function signInWithPasskey() {
  if (!values.username?.trim()) {
    error.value = 'Username is required'
    return
  }

  isLoading.value = true
  error.value = ''

  try {
    await authenticate(values.username)
    await navigateTo(redirectTo.value)
  }
  catch {
    error.value = 'Authentication failed. Please ensure your passkey is set up correctly, or sign in with your password.'
    isLoading.value = false
  }
}

function signInWithProvider(provider: string) {
  error.value = ''
  startOAuth(provider, 'login', redirectTo.value)
}

definePageMeta({
  layout: 'empty',
  title: 'Login',
  breadcrumb: 'Login',
})
</script>

<template>
  <AuthPageLayout>
    <Card class="w-full">
      <CardHeader class="text-center">
        <CardTitle>
          {{ isTwoFactorStep ? 'Two-Factor Authentication' : 'Welcome Back' }}
        </CardTitle>
        <CardDescription>
          {{ isTwoFactorStep ? 'Enter the code from your authenticator app' : 'Sign in to your account to continue' }}
        </CardDescription>
      </CardHeader>

      <CardContent class="flex flex-col gap-4">
        <Alert
          v-if="error"
          variant="destructive"
        >
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>

        <Alert v-if="successMessage">
          <AlertDescription>{{ successMessage }}</AlertDescription>
        </Alert>

        <form
          v-if="isTwoFactorStep"
          class="flex flex-col gap-4"
          @submit.prevent="onTwoFactorSubmit"
        >
          <FieldGroup>
            <VeeField
              v-slot="{ field, errors }"
              name="code"
            >
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="code">
                  Authentication code
                </FieldLabel>
                <div class="relative">
                  <ShieldCheck
                    aria-hidden="true"
                    class="absolute left-3 top-3 size-4"
                  />
                  <Input
                    id="code"
                    :model-value="field.value"
                    name="code"
                    autocomplete="one-time-code"
                    maxlength="8"
                    placeholder="Code or backup code"
                    class="h-11 pl-9"
                    :aria-invalid="!!errors.length"
                    :disabled="isLoading"
                    @update:model-value="field.onChange"
                  />
                </div>
                <FieldDescription>
                  Enter a 6-digit authenticator code or an 8-character backup code.
                </FieldDescription>
                <FieldError
                  v-if="errors.length"
                  :errors="errors"
                />
              </Field>
            </VeeField>
          </FieldGroup>

          <Button
            type="submit"
            class="h-11 w-full"
            :is-loading="isLoading"
          >
            Verify code
          </Button>
          <Button
            type="button"
            variant="ghost"
            class="w-full"
            @click="navigateTo(apiRoutes.AUTH_LOGIN)"
          >
            Sign in as another user
          </Button>
        </form>

        <form
          v-else
          ref="passwordForm"
          action="/api/auth/login-password"
          method="POST"
          class="flex flex-col gap-4"
          @submit.prevent="onPasswordSubmit"
        >
          <input
            type="hidden"
            name="redirect-to"
            :value="redirectTo"
          >
          <input
            type="hidden"
            name="cf-turnstile-response"
            :value="turnstileToken"
          >

          <FieldGroup>
            <VeeField
              v-slot="{ field, errors }"
              name="username"
            >
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="username">
                  Username
                </FieldLabel>
                <div class="relative">
                  <User
                    aria-hidden="true"
                    class="absolute left-3 top-3 size-4"
                  />
                  <Input
                    id="username"
                    :model-value="field.value"
                    name="username"
                    type="text"
                    autocomplete="username"
                    placeholder="Enter your username"
                    class="h-11 pl-9"
                    :disabled="isLoading"
                    :aria-invalid="!!errors.length"
                    @update:model-value="field.onChange"
                  />
                </div>
                <FieldError
                  v-if="errors.length"
                  :errors="errors"
                />
              </Field>
            </VeeField>

            <VeeField
              v-slot="{ field, errors }"
              name="password"
            >
              <Field :data-invalid="!!errors.length">
                <div class="flex items-center justify-between gap-3">
                  <FieldLabel for="password">
                    Password
                  </FieldLabel>
                  <NuxtLink
                    :to="apiRoutes.AUTH_FORGOT_PASSWORD"
                    class="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </NuxtLink>
                </div>
                <div class="relative">
                  <Lock
                    aria-hidden="true"
                    class="absolute left-3 top-3 size-4"
                  />
                  <Input
                    id="password"
                    :model-value="field.value"
                    name="password"
                    :type="showPassword ? 'text' : 'password'"
                    autocomplete="current-password"
                    placeholder="Enter your password"
                    class="h-11 pl-9 pr-9"
                    :disabled="isLoading"
                    :aria-invalid="!!errors.length"
                    @update:model-value="field.onChange"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="absolute right-1 top-1 size-9 p-0 hover:bg-transparent"
                    :aria-label="showPassword ? 'Hide password' : 'Show password'"
                    @click="showPassword = !showPassword"
                  >
                    <Eye
                      v-if="!showPassword"
                      aria-hidden="true"
                      class="size-4"
                    />
                    <EyeOff
                      v-else
                      aria-hidden="true"
                      class="size-4"
                    />
                  </Button>
                </div>
                <FieldError
                  v-if="errors.length"
                  :errors="errors"
                />
              </Field>
            </VeeField>
          </FieldGroup>

          <div class="flex flex-col gap-3">
            <NuxtTurnstile v-model="turnstileToken" />
            <Button
              type="submit"
              class="h-11 w-full"
              :is-loading="isLoading"
            >
              <Lock
                aria-hidden="true"
                class="size-4"
              />
              Sign In with Password
            </Button>

            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <span class="w-full border-t" />
              </div>
              <div class="relative flex justify-center text-xs uppercase">
                <span class="rounded-xl bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              class="w-full"
              :disabled="!values.username?.trim()"
              :is-loading="isLoading"
              @click="signInWithPasskey"
            >
              <Fingerprint
                aria-hidden="true"
                class="size-4"
              />
              Sign In with a Passkey
            </Button>

            <template
              v-for="provider in AVAILABLE_PROVIDERS"
              :key="provider.id"
            >
              <Button
                type="button"
                variant="outline"
                class="w-full"
                :is-loading="oauthLoadingProvider === provider.id"
                :disabled="isLoading || oauthLoadingProvider !== null"
                @click="signInWithProvider(provider.id)"
              >
                <div class="flex size-4 items-center justify-center">
                  <OAuthIcon :provider="provider.id" />
                </div>
                Continue with {{ provider.name }}
              </Button>
            </template>
          </div>
        </form>
      </CardContent>

      <CardFooter
        v-if="!isTwoFactorStep"
        class="flex flex-col gap-3 text-center"
      >
        <p class="text-xs text-muted-foreground">
          By signing in, you agree to our
          <NuxtLink
            to="https://nnsvn.me/terms"
            class="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms of Service
          </NuxtLink>
          and
          <NuxtLink
            to="https://nnsvn.me/privacy"
            class="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </NuxtLink>
        </p>

        <p class="text-sm text-muted-foreground">
          Don't have an account?
          <NuxtLink
            :to="apiRoutes.AUTH_REGISTER"
            class="font-medium text-primary hover:underline"
          >
            Sign Up
          </NuxtLink>
        </p>
      </CardFooter>
    </Card>
  </AuthPageLayout>
</template>
