<script setup lang="ts">
import AuthPageLayout from '@/components/auth/AuthPageLayout.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { apiRoutes } from '#shared/apiRoutes'
import { getAuthErrorMessage } from '#shared/constants/authMessages'
import { resendVerificationSchema } from '#shared/schemas/userSchema'
import { apiRequest } from '@/utils/apiRequest'
import { parseApiError } from '@/utils/apiError'
import { getQueryString, safeRedirectPath } from '@/utils/safeRedirect'
import { Field as VeeField, useForm } from 'vee-validate'
import { MailCheck } from '@lucide/vue'

const route = useRoute()
const isLoading = ref(false)
const error = ref('')
const successMessage = ref('')

const emailFromQuery = computed(() => getQueryString(route.query.email))
const redirectTo = computed(() => safeRedirectPath(route.query.redirectTo))
const token = computed(() => getQueryString(route.query.token))

watch(() => route.query.error, (queryValue) => {
  const errorCode = getQueryString(queryValue)
  error.value = getAuthErrorMessage(errorCode) || ''
}, { immediate: true })

onMounted(() => {
  if (token.value) {
    window.location.assign(`/api/auth/verify-email?token=${encodeURIComponent(token.value)}`)
  }
})

const { handleSubmit, setFieldError } = useForm({
  initialValues: {
    email: emailFromQuery.value,
  },
  validationSchema: resendVerificationSchema,
})

const onSubmit = handleSubmit(async (values) => {
  isLoading.value = true
  error.value = ''
  successMessage.value = ''

  try {
    await apiRequest(apiRoutes.AUTH_RESEND_VERIFICATION, {
      method: 'POST',
      body: values,
    })
    successMessage.value = 'Verification email sent. Please check your inbox.'
  }
  catch (err: unknown) {
    const parsedError = parseApiError(err, 'Unable to send verification email. Please try again.')
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
  title: 'Verify Email',
  breadcrumb: 'Verify Email',
})
</script>

<template>
  <AuthPageLayout quote="Verification keeps the template honest: confirm ownership before unlocking the account.">
    <Card class="w-full">
      <CardHeader class="text-center">
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          We sent a verification link to your email address. Confirm your email before signing in.
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
                  <MailCheck
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

          <Button
            type="submit"
            class="h-11 w-full"
            :is-loading="isLoading"
          >
            Resend verification email
          </Button>
        </form>
      </CardContent>

      <CardFooter class="flex flex-col gap-3 text-center text-sm text-muted-foreground">
        <NuxtLink
          :to="`${apiRoutes.AUTH_LOGIN}?redirectTo=${encodeURIComponent(redirectTo)}`"
          class="font-medium text-primary hover:underline"
        >
          Back to sign in
        </NuxtLink>
      </CardFooter>
    </Card>
  </AuthPageLayout>
</template>
