<script setup lang="ts">
import { Field as VeeField, useForm } from 'vee-validate';
import { setupTotpFormSchema } from '#layers/auth-2fa/shared/schemas/twoFactorSchema';
import type { SetupTotpFormInput } from '#layers/auth-2fa/shared/schemas/twoFactorSchema';
import type { TwoFactorPasswordFormProps } from '#layers/auth-2fa/types/settings';

const props = defineProps<TwoFactorPasswordFormProps>();
const emit = defineEmits<{ cancel: [] }>();
const { t } = useI18n();
const inputId = useId();
const { handleSubmit, setFieldError } = useForm<SetupTotpFormInput>({
  initialValues: { password: '' },
  validationSchema: setupTotpFormSchema,
});

const submit = handleSubmit(async ({ password }) => {
  if (props.busy) return;
  const error = await props.submitPassword(password);
  if (error) setFieldError('password', error);
});
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit="submit">
    <FieldGroup>
      <VeeField v-slot="{ field, errors }" name="password">
        <Field :data-invalid="!!errors.length">
          <FieldLabel :for="inputId">{{ t('settings.password.currentPassword') }}</FieldLabel>
          <Input
            :id="inputId"
            type="password"
            autocomplete="current-password"
            :model-value="field.value"
            :disabled="busy"
            :aria-invalid="!!errors.length"
            :aria-describedby="errors.length ? `${inputId}-error` : undefined"
            @update:model-value="field.onChange"
            @blur="field.onBlur"
          />
          <FieldError v-if="errors.length" :id="`${inputId}-error`" :errors="errors.map((key) => t(key))" />
        </Field>
      </VeeField>
    </FieldGroup>
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <slot name="cancel">
        <Button type="button" variant="outline" :disabled="busy" @click="emit('cancel')">
          {{ t('settings.cancel') }}
        </Button>
      </slot>
      <Button type="submit" :variant="destructive ? 'destructive' : 'default'" :disabled="busy">
        <Spinner v-if="busy" data-icon="inline-start" aria-hidden="true" />
        {{ actionLabel }}
      </Button>
    </div>
  </form>
</template>
