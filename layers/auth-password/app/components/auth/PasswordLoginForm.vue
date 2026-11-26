<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue';
import { Field as VeeField, useForm } from 'vee-validate';
import '#layers/auth-password/types/extensions';
import { passwordRoutes } from '#layers/auth-password/shared/passwordRoutes';
import { loginSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import type { AuthMethodEmits, AuthMethodProps } from '#layers/auth/types/authMethods';

const { redirectTo, pending, rememberedUsername } = defineProps<AuthMethodProps>();
const emit = defineEmits<AuthMethodEmits>();
const showPassword = ref(false);
const challenge = useFormChallenge();
const { pending: challengePending } = challenge;
const form = useTemplateRef<HTMLFormElement>('form');
const localePath = useAppLocalePath();
const { handleSubmit, values } = useForm({
  initialValues: {
    username: rememberedUsername ?? '',
    password: '',
  },
  validationSchema: loginSchema.pick({ username: true, password: true }),
});

onMounted(() => {
  if (rememberedUsername)
    form.value?.querySelector<HTMLInputElement>('#password')?.focus({ preventScroll: true });
});

const onSubmit = handleSubmit(async () => {
  if (pending || challengePending.value || !form.value) return;
  emit('pending', true);
  form.value.submit();
});
</script>

<template>
  <form
    ref="form"
    :action="passwordRoutes.AUTH_LOGIN_PASSWORD"
    method="POST"
    class="flex flex-col gap-4"
    @submit.prevent="onSubmit"
  >
    <input type="hidden" name="redirect-to" :value="redirectTo" />
    <VeeField v-slot="{ field, errors }" name="username">
      <Field :data-invalid="!!errors.length">
        <FieldLabel for="username">{{ $t('account_page.username') }}</FieldLabel>
        <Input
          id="username"
          :model-value="field.value"
          name="username"
          type="text"
          autocomplete="username"
          autocapitalize="none"
          :spellcheck="false"
          :placeholder="$t('auth.username_placeholder')"
          class="h-10"
          :disabled="pending"
          :aria-invalid="!!errors.length"
          @update:model-value="field.onChange"
        />
        <FieldError
          v-if="errors.length"
          :errors="errors.map((key) => $t($te(key) ? key : 'errors.invalid_field'))"
        />
      </Field>
    </VeeField>

    <VeeField v-slot="{ field, errors }" name="password">
      <Field :data-invalid="!!errors.length">
        <div class="flex items-center justify-between">
          <FieldLabel for="password">{{ $t('auth_password.password') }}</FieldLabel>
          <NuxtLink
            :to="localePath(passwordRoutes.AUTH_FORGOT_PASSWORD)"
            class="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {{ $t('auth_password.forgot_password') }}
          </NuxtLink>
        </div>
        <div class="relative">
          <Input
            id="password"
            :model-value="field.value"
            name="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            :placeholder="$t('auth_password.password_placeholder')"
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
            :aria-label="
              $t(showPassword ? 'auth_password.hide_password' : 'auth_password.show_password')
            "
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            <Eye v-if="!showPassword" aria-hidden="true" class="size-4" />
            <EyeOff v-else aria-hidden="true" class="size-4" />
          </Button>
        </div>
        <FieldError
          v-if="errors.length"
          :errors="errors.map((key) => $t($te(key) ? key : 'errors.invalid_field'))"
        />
      </Field>
    </VeeField>

    <FormChallenge :challenge="challenge.challenge" />

    <Button type="submit" class="h-10 w-full" :disabled="challengePending" :is-loading="pending">{{
      $t('common.sign_in')
    }}</Button>

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
