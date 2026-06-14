<script setup lang="ts">
import AuthPageLayout from '@/components/auth/AuthPageLayout.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { apiRoutes } from '#shared/apiRoutes'
import { forgotPasswordFormSchema } from '#shared/schemas/userSchema'
import { apiRequest } from '@/utils/apiRequest'
import { parseApiError } from '@/utils/apiError'
import { Field as VeeField, useForm } from 'vee-validate'
import { Mail } from '@lucide/vue'

const isLoading = ref(false)
const error = ref('')
const successMessage = ref('')
const turnstileToken = ref('')

const { handleSubmit, setFieldError } = useForm({
  initialValues: {
    email: '',
  },
  validationSchema: forgotPasswordFormSchema,
})

const onSubmit = handleSubmit(async (values) => {
  if (!turnstileToken.value) {
    error.value = 'Please complete the security verification before continuing.'
    return
  }

  isLoading.value = true
  error.value = ''
  successMessage.value = ''

  try {
    await apiRequest(apiRoutes.AUTH_FORGOT_PASSWORD_API, {
      method: 'POST',
      body: {
        email: values.email,
        'cf-turnstile-response': turnstileToken.value,
      },
    })

    successMessage.value = 'If an account exists for that email, a reset link has been sent.'
  }
  catch (err: unknown) {
    const parsedError = parseApiError(err, 'Unable to send reset instructions. Please try again.')
    if (parsedError.fieldErrors.email?.length) {
      setFieldError('email', parsedError.fieldErrors.email[0])
    }
    error.value = parsedError.message
  }
  finally {
    isLoading.value = false
  }
})

definePageMeta({
  layout: 'empty',
  title: 'Forgot Password',
  breadcrumb: 'Forgot Password',
})
</script>

<template>
  <AuthPageLayout quote="Recovery flows should be calm, private, and explicit about what happens next.">
    <Card class="w-full">
      <CardHeader class="text-center">
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we’ll send password reset instructions if an account exists.
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
          class="flex flex-col gap-4"
          @submit.prevent="onSubmit"
        >
          <FieldGroup>
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
                    placeholder="name@example.com"
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
          </FieldGroup>

          <NuxtTurnstile v-model="turnstileToken" />
          <Button
            type="submit"
            class="h-11 w-full"
            :is-loading="isLoading"
          >
            Send reset link
          </Button>
        </form>
      </CardContent>

      <CardFooter class="justify-center text-sm text-muted-foreground">
        Remember your password?
        <NuxtLink
          :to="apiRoutes.AUTH_LOGIN"
          class="ml-1 font-medium text-primary hover:underline"
        >
          Sign in
        </NuxtLink>
      </CardFooter>
    </Card>
  </AuthPageLayout>
</template>
