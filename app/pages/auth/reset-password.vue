<script setup lang="ts">
import AuthPageLayout from '@/components/auth/AuthPageLayout.vue'
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { apiRoutes } from '#shared/apiRoutes'
import { resetPasswordFormSchema } from '#shared/schemas/userSchema'
import { calculatePasswordStrength } from '@/utils/passwordValidation'
import { apiRequest } from '@/utils/apiRequest'
import { parseApiError } from '@/utils/apiError'
import { getQueryString } from '@/utils/safeRedirect'
import { Field as VeeField, useForm } from 'vee-validate'
import { Eye, EyeOff, Lock } from '@lucide/vue'

const route = useRoute()
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const isLoading = ref(false)
const error = ref('')

const token = computed(() => getQueryString(route.query.token))

const form = useForm({
  initialValues: {
    password: '',
    confirmPassword: '',
  },
  validationSchema: resetPasswordFormSchema,
})

const { handleSubmit, values, setFieldError } = form
const passwordStrength = computed(() => calculatePasswordStrength(values.password || ''))

const onSubmit = handleSubmit(async (formValues) => {
  if (!token.value) {
    error.value = 'This reset link is invalid. Please request a new one.'
    return
  }

  isLoading.value = true
  error.value = ''

  try {
    await apiRequest(apiRoutes.AUTH_RESET_PASSWORD_API, {
      method: 'POST',
      body: {
        token: token.value,
        password: formValues.password,
        confirmPassword: formValues.confirmPassword,
      },
    })

    await navigateTo(`${apiRoutes.AUTH_LOGIN}?success=password-reset`)
  }
  catch (err: unknown) {
    const parsedError = parseApiError(err, 'Unable to reset your password. Please try again.')
    if (parsedError.fieldErrors.password?.length) {
      setFieldError('password', parsedError.fieldErrors.password[0])
    }
    if (parsedError.fieldErrors.confirmPassword?.length) {
      setFieldError('confirmPassword', parsedError.fieldErrors.confirmPassword[0])
    }
    error.value = parsedError.message
  }
  finally {
    isLoading.value = false
  }
})

definePageMeta({
  layout: 'empty',
  title: 'Reset Password',
  breadcrumb: 'Reset Password',
})
</script>

<template>
  <AuthPageLayout quote="A reset flow should prove ownership, update one secret, and clean up stale tokens.">
    <Card class="w-full">
      <CardHeader class="text-center">
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          Enter a strong password to finish resetting your account.
        </CardDescription>
      </CardHeader>

      <CardContent class="flex flex-col gap-4">
        <Alert
          v-if="error || !token"
          variant="destructive"
        >
          <AlertDescription>
            {{ error || 'This reset link is invalid. Please request a new one.' }}
          </AlertDescription>
        </Alert>

        <form
          class="flex flex-col gap-4"
          @submit.prevent="onSubmit"
        >
          <FieldGroup>
            <VeeField
              v-slot="{ field, errors }"
              name="password"
            >
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="password">
                  New password
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
                    placeholder="Enter your new password"
                    class="h-11 pl-9 pr-9"
                    :aria-invalid="!!errors.length"
                    :disabled="isLoading || !token"
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
              name="confirmPassword"
            >
              <Field :data-invalid="!!errors.length">
                <FieldLabel for="confirmPassword">
                  Confirm password
                </FieldLabel>
                <div class="relative">
                  <Lock
                    aria-hidden="true"
                    class="absolute left-3 top-3 size-4"
                  />
                  <Input
                    id="confirmPassword"
                    :model-value="field.value"
                    name="confirmPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    placeholder="Confirm your new password"
                    class="h-11 pl-9 pr-9"
                    :aria-invalid="!!errors.length"
                    :disabled="isLoading || !token"
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

          <Button
            type="submit"
            class="h-11 w-full"
            :disabled="!token"
            :is-loading="isLoading"
          >
            Reset password
          </Button>
        </form>
      </CardContent>
    </Card>
  </AuthPageLayout>
</template>
