<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue';
import { Field as VeeField, useForm } from 'vee-validate';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { loginSchema } from '#layers/auth/shared/schemas/userSchema';
import type { AuthMethodEmits, AuthMethodProps } from '#layers/auth/types/authMethods';

const { redirectTo, pending } = defineProps<AuthMethodProps>();
const emit = defineEmits<AuthMethodEmits>();
const showPassword = ref(false);
const turnstileToken = ref('');
const { handleSubmit, values } = useForm({
  initialValues: {
    username: '',
    password: '',
  },
  validationSchema: loginSchema.pick({ username: true, password: true }),
});

const onSubmit = handleSubmit(async () => {
  // Native form submission for server-side auth
  const formEl = document.querySelector(`form[action="${authRoutes.AUTH_LOGIN_PASSWORD}"]`);
  if (formEl instanceof HTMLFormElement) formEl.submit();
});
</script>

<template>
  <form
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
          :disabled="pending"
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
            :disabled="pending"
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

    <Button type="submit" class="h-10 w-full" :is-loading="pending">Sign in</Button>

    <ExtensionSlot
      name="auth:login:alternatives"
      :username="values.username ?? ''"
      :redirect-to="redirectTo"
      :pending="pending"
      @done="emit('done', $event)"
      @pending="emit('pending', $event)"
      @error="emit('error', $event)"
    />
  </form>
</template>
