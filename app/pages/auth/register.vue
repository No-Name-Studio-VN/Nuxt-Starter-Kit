<script setup lang="ts">
import CenteredAppLayout from '@/components/CenteredAppLayout.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, User, Lock, Eye, EyeOff, Mail } from 'lucide-vue-next'
import PasskeyRegistrationDialog from '@/components/PasskeyRegistrationDialog.vue'
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator.vue'
import type { NuxtError } from '#app'

const { fetch } = useUserSession()
const { calculatePasswordStrength, validateField, validateForm } = usePasswordValidation()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const isLoading = ref(false)
const error = ref('')
const showPasskeyDialog = ref(false)
const registeredUsername = ref('')
const fieldErrors = ref<{
  username?: string
  email?: string
  password?: string
  confirmPassword?: string
}>({})
const passwordStrength = computed(() => calculatePasswordStrength(password.value))

// Validate field on blur
function handleFieldBlur(field: 'username' | 'email' | 'password' | 'confirmPassword') {
  let value = ''
  if (field === 'username')
    value = username.value
  else if (field === 'email')
    value = email.value
  else if (field === 'password')
    value = password.value
  else
    value = confirmPassword.value

  const validationError = validateField(field, value, {
    username: username.value,
    email: email.value,
    password: password.value,
    confirmPassword: confirmPassword.value,
  })

  if (validationError) {
    fieldErrors.value[field] = validationError
  }
  else {
    fieldErrors.value[field] = undefined
  }
}

// Clear field error on input
function handleFieldInput(field: 'username' | 'email' | 'password' | 'confirmPassword') {
  if (fieldErrors.value[field]) {
    fieldErrors.value[field] = undefined
  }
}

// Check if form is valid for submission
const isFormValid = computed(() => {
  return username.value.trim()
    && email.value.trim()
    && password.value.trim()
    && confirmPassword.value.trim() === password.value.trim()
    && passwordStrength.value.score >= 60 // Require strong password
    && Object.values(fieldErrors.value).every(error => !error)
})

async function registerWithPassword() {
  // Clear previous errors
  error.value = ''
  fieldErrors.value = {}

  // Validate entire form
  const validation = validateForm({
    username: username.value,
    email: email.value,
    password: password.value,
    confirmPassword: confirmPassword.value,
  })

  if (!validation.success) {
    fieldErrors.value = validation.errors
    error.value = Object.values(validation.errors)[0] || 'Please fix the errors below'
    return
  }

  // Check password strength
  if (passwordStrength.value.score < 60) {
    error.value = 'Please use a stronger password'
    return
  }

  try {
    isLoading.value = true
    await $fetch('/api/auth/register-password', {
      method: 'POST',
      body: {
        username: username.value,
        email: email.value,
        password: password.value,
      },
    })
    registeredUsername.value = username.value
    await fetch()
    showPasskeyDialog.value = true
  }
  catch (err: unknown) {
    error.value = err instanceof Error && 'statusMessage' in err
      ? (err as NuxtError).statusMessage || 'Registration failed'
      : 'Registration failed'
  }
  finally {
    isLoading.value = false
  }
}

function onPasskeyCreated() {
  navigateTo('/')
}

function onPasskeySkipped() {
  navigateTo('/')
}

definePageMeta({
  layout: 'empty',
  title: 'Sign Up',
  breadcrumb: 'Register',
})
</script>

<template>
  <CenteredAppLayout
    :center-content="true"
    :full-width="true"
    :hide-sidebar-trigger="true"
    title="Register"
  >
    <Card class="w-full max-w-md mx-4">
      <CardHeader class="text-center relative">
        <CardTitle>
          Create Account
        </CardTitle>
        <CardDescription>
          Join to start your journey
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Alert
          v-if="error"
          variant="destructive"
          class="mb-4"
        >
          <AlertDescription>{{ error }}</AlertDescription>
        </Alert>

        <form
          class="space-y-4"
          @submit.prevent="registerWithPassword"
        >
          <div class="space-y-2">
            <Label
              for="username"
              class="text-sm font-medium"
            >
              Username
            </Label>
            <div class="relative">
              <User class="absolute left-3 top-3 h-4 w-4" />
              <Input
                id="username"
                v-model="username"
                type="text"
                placeholder="Enter your username"
                class="pl-9 h-11"
                :class="{ 'border-destructive': fieldErrors.username }"
                :disabled="isLoading"
                required
                @blur="handleFieldBlur('username')"
                @input="handleFieldInput('username')"
              />
            </div>
            <p
              v-if="fieldErrors.username"
              class="text-xs text-destructive"
            >
              {{ fieldErrors.username }}
            </p>
          </div>

          <div class="space-y-2">
            <Label
              for="email"
              class="text-sm font-medium"
            >
              Email
            </Label>
            <div class="relative">
              <Mail class="absolute left-3 top-3 h-4 w-4" />
              <Input
                id="email"
                v-model="email"
                type="email"
                placeholder="Enter your email"
                class="pl-9 h-11"
                :class="{ 'border-destructive': fieldErrors.email }"
                :disabled="isLoading"
                required
                @blur="handleFieldBlur('email')"
                @input="handleFieldInput('email')"
              />
            </div>
            <p
              v-if="fieldErrors.email"
              class="text-xs text-destructive"
            >
              {{ fieldErrors.email }}
            </p>
          </div>

          <div class="space-y-2">
            <Label
              for="password"
              class="text-sm font-medium"
            >
              Password
            </Label>
            <div class="relative">
              <Lock class="absolute left-3 top-3 h-4 w-4" />
              <Input
                id="password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
                class="pl-9 pr-9 h-11"
                :class="{ 'border-destructive': fieldErrors.password }"
                :disabled="isLoading"
                required
                @blur="handleFieldBlur('password')"
                @input="handleFieldInput('password')"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="absolute right-1 top-1 h-9 w-9 p-0 hover:bg-transparent"
                @click="showPassword = !showPassword"
              >
                <Eye
                  v-if="!showPassword"
                  class="h-4 w-4"
                />
                <EyeOff
                  v-else
                  class="h-4 w-4"
                />
              </Button>
            </div>
            <p
              v-if="fieldErrors.password"
              class="text-xs text-destructive"
            >
              {{ fieldErrors.password }}
            </p>
            <!-- Password Strength Indicator -->
            <PasswordStrengthIndicator
              :password="password"
              :strength="passwordStrength"
            />
          </div>

          <div class="space-y-2">
            <Label
              for="confirmPassword"
              class="text-sm font-medium"
            >
              Confirm Password
            </Label>
            <div class="relative">
              <Lock class="absolute left-3 top-3 h-4 w-4" />
              <Input
                id="confirmPassword"
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="Confirm your password"
                class="pl-9 pr-9 h-11"
                :class="{ 'border-destructive': fieldErrors.confirmPassword }"
                :disabled="isLoading"
                required
                @blur="handleFieldBlur('confirmPassword')"
                @input="handleFieldInput('confirmPassword')"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="absolute right-1 top-1 h-9 w-9 p-0 hover:bg-transparent"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <Eye
                  v-if="!showConfirmPassword"
                  class="h-4 w-4"
                />
                <EyeOff
                  v-else
                  class="h-4 w-4"
                />
              </Button>
            </div>
            <p
              v-if="fieldErrors.confirmPassword"
              class="text-xs text-destructive"
            >
              {{ fieldErrors.confirmPassword }}
            </p>
          </div>

          <Button
            type="submit"
            class="w-full h-11"
            :disabled="isLoading || !isFormValid"
          >
            <Loader2
              v-if="isLoading"
              class="mr-2 h-4 w-4 animate-spin"
            />
            <Lock
              v-else
              class="mr-2 h-4 w-4"
            />
            Create Account
          </Button>
          <p
            v-if="password && passwordStrength.score < 80"
            class="text-xs text-center text-muted-foreground"
          >
            Password must be strong to create an account
          </p>
        </form>

        <div class="text-center mt-6 space-y-3">
          <div class="text-xs text-gray-500 dark:text-gray-400">
            By creating an account, you agree to our
            <NuxtLink
              to="https://nnsvn.me/terms"
              class="underline"
              target="_blank"
              rel="noopener noreferrer"
            >Terms of Service</NuxtLink>
            and
            <NuxtLink
              to="https://nnsvn.me/privacy"
              class="underline"
              target="_blank"
              rel="noopener noreferrer"
            >Privacy Policy</NuxtLink>
          </div>

          <div class="text-sm text-gray-600 dark:text-gray-300">
            Already have an account?
            <nuxt-link
              to="/auth/login"
              class="text-primary hover:underline font-medium"
            >
              Sign In
            </nuxt-link>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Passkey Registration Dialog -->
    <PasskeyRegistrationDialog
      v-model:open="showPasskeyDialog"
      :username="registeredUsername"
      @passkey-created="onPasskeyCreated"
      @skip-passkey="onPasskeySkipped"
    />
  </CenteredAppLayout>
</template>
