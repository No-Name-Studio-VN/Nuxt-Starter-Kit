<script setup lang="ts">
import AuthPageLayout from '@/components/auth/AuthPageLayout.vue'
import { useOAuthPopup } from '@/composables/useOAuthPopup'
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { apiRoutes } from '#shared/apiRoutes'
import { getAuthErrorMessage } from '#shared/constants/authMessages'
import { AVAILABLE_PROVIDERS } from '#shared/constants/oauthProviders'
import { registerUserSchema } from '#shared/schemas/userSchema'
import { calculatePasswordStrength } from '@/utils/passwordValidation'
import { getQueryString, safeRedirectPath } from '@/utils/safeRedirect'
import { Field as VeeField, useForm } from 'vee-validate'
import { Eye, EyeOff, Lock, Mail, UserIcon } from '@lucide/vue'

const route = useRoute()
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const isLoading = ref(false)
const error = ref('')
const turnstileToken = ref('')
const registerForm = ref<HTMLFormElement | null>(null)

const redirectTo = computed(() => safeRedirectPath(route.query.redirectTo))

const form = useForm({
  initialValues: {
    'username': '',
    'name': '',
    'email': '',
    'password': '',
    'confirm-password': '',
    'cf-turnstile-response': '',
    'redirect-to': '',
  },
  validationSchema: registerUserSchema,
})

const { handleSubmit, values, meta, setFieldValue } = form

const { oauthLoadingProvider, startOAuth } = useOAuthPopup({
  onError(message) {
    error.value = message
  },
})

const onSubmit = handleSubmit(async () => {
  isLoading.value = true
  registerForm.value?.submit()
})

watch(turnstileToken, (val) => {
  setFieldValue('cf-turnstile-response', val)
})

watch(redirectTo, (val) => {
  setFieldValue('redirect-to', val)
}, { immediate: true })

const passwordStrength = computed(() => calculatePasswordStrength(values.password || ''))

const isFormValid = computed(() => meta.value.valid && passwordStrength.value.score >= 80)

watch(() => route.query.error, (queryValue) => {
  const errorCode = getQueryString(queryValue)
  error.value = getAuthErrorMessage(errorCode) || ''
}, { immediate: true })

function signUpWithProvider(provider: string) {
  error.value = ''
  startOAuth(provider, 'login', redirectTo.value)
}

definePageMeta({
  layout: 'empty',
  title: 'Sign Up',
  breadcrumb: 'Register',
})
</script>

<template>
  <AuthPageLayout quote="Start with security defaults that are explicit, typed, and easy to replace.">
    <Card class="w-full">
      <CardHeader class="text-center">
        <CardTitle>Create Account</CardTitle>
        <CardDescription>
          Create your account and verify your email to continue.
        </CardDescription>
      </CardHeader>

      <CardContent class="flex flex-col gap-5">
        <Alert
          v-if="error"
          variant="destructive"
        >
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>

        <div class="flex flex-col gap-3">
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
              @click="signUpWithProvider(provider.id)"
            >
              <div class="flex size-4 items-center justify-center">
                <OAuthIcon :provider="provider.id" />
              </div>
              Sign up with {{ provider.name }}
            </Button>
          </template>

          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <span class="w-full border-t" />
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="rounded-xl bg-card px-2 text-muted-foreground">Or sign up with email</span>
            </div>
          </div>
        </div>

        <form
          ref="registerForm"
          action="/api/auth/register-password"
          method="POST"
          class="flex flex-col gap-4"
          @submit.prevent="onSubmit"
        >
          <input
            type="hidden"
            name="cf-turnstile-response"
            :value="turnstileToken"
          >
          <input
            type="hidden"
            name="redirect-to"
            :value="redirectTo"
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
                  <UserIcon
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
                    :aria-invalid="!!errors.length"
                    :disabled="isLoading"
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
              name="name"
            >
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="name">
                  Display Name
                </FieldLabel>
                <div class="relative">
                  <UserIcon
                    aria-hidden="true"
                    class="absolute left-3 top-3 size-4"
                  />
                  <Input
                    id="name"
                    :model-value="field.value"
                    name="name"
                    type="text"
                    autocomplete="name"
                    placeholder="Enter your display name"
                    class="h-11 pl-9"
                    :aria-invalid="!!errors.length"
                    :disabled="isLoading"
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
              name="email"
            >
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="email">
                  Email
                </FieldLabel>
                <div class="relative">
                  <Mail
                    aria-hidden="true"
                    class="absolute left-3 top-3 size-4"
                  />
                  <Input
                    id="email"
                    :model-value="field.value"
                    name="email"
                    type="email"
                    autocomplete="email"
                    placeholder="Enter your email"
                    class="h-11 pl-9"
                    :aria-invalid="!!errors.length"
                    :disabled="isLoading"
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
                <FieldLabel for="password">
                  Password
                </FieldLabel>
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
                    autocomplete="new-password"
                    placeholder="Enter your password"
                    class="h-11 pl-9 pr-9"
                    :aria-invalid="!!errors.length"
                    :disabled="isLoading"
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
                <PasswordStrengthIndicator
                  :password="values.password || ''"
                  :strength="passwordStrength"
                />
              </Field>
            </VeeField>

            <VeeField
              v-slot="{ field, errors }"
              name="confirm-password"
            >
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="confirmPassword">
                  Confirm Password
                </FieldLabel>
                <div class="relative">
                  <Lock
                    aria-hidden="true"
                    class="absolute left-3 top-3 size-4"
                  />
                  <Input
                    id="confirmPassword"
                    :model-value="field.value"
                    name="confirm-password"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    placeholder="Confirm your password"
                    class="h-11 pl-9 pr-9"
                    :aria-invalid="!!errors.length"
                    :disabled="isLoading"
                    @update:model-value="field.onChange"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="absolute right-1 top-1 size-9 p-0 hover:bg-transparent"
                    :aria-label="showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'"
                    @click="showConfirmPassword = !showConfirmPassword"
                  >
                    <Eye
                      v-if="!showConfirmPassword"
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

          <NuxtTurnstile v-model="turnstileToken" />
          <Button
            type="submit"
            class="h-11 w-full"
            :disabled="!isFormValid"
            :is-loading="isLoading"
          >
            <Lock
              aria-hidden="true"
              class="size-4"
            />
            Create Account
          </Button>
          <p
            v-if="values.password && passwordStrength.score < 80"
            class="text-center text-xs text-muted-foreground"
          >
            Password must be strong to create an account.
          </p>
        </form>
      </CardContent>

      <CardFooter class="flex flex-col gap-3 text-center">
        <p class="text-xs text-muted-foreground">
          By creating an account, you agree to our
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
          Already have an account?
          <NuxtLink
            :to="apiRoutes.AUTH_LOGIN"
            class="font-medium text-primary hover:underline"
          >
            Sign In
          </NuxtLink>
        </p>
      </CardFooter>
    </Card>
  </AuthPageLayout>
</template>
