<script setup lang="ts">
import { Eye, EyeOff, Lock } from '@lucide/vue';
import { useMounted } from '@vueuse/core';
import { formatDate } from '@/lib/utils';
import SecurityCard from '#layers/auth/app/components/settings/SecurityCard.vue';
import SecurityRow from '#layers/auth/app/components/settings/SecurityRow.vue';
import { Field as VeeField, useForm } from 'vee-validate';
import { toast } from 'vue-sonner';
import { passwordRoutes } from '#layers/auth-password/shared/passwordRoutes';
import { changePasswordSchema, setPasswordSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import type { ChangePasswordInput } from '#layers/auth-password/shared/schemas/passwordSchema';
import type { SettingsSectionProps } from '#layers/auth/types/settings';
import type { PasswordUpdatePayload } from '#layers/auth-password/types/userSecurity';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const props = defineProps<SettingsSectionProps>();
const hasPassword = computed(() => (props.profile.signInMethods.password ?? 0) > 0);
const { t, te, locale } = useI18n();
const mounted = useMounted();
const passwordDescription = computed(() => {
  if (!hasPassword.value) return t('settings.password.add_hint');
  const { username, passwordChangedAt } = props.profile;
  const date = mounted.value ? formatDate(passwordChangedAt, locale.value) : '';
  return date ? t('settings.password.username_changed', { username: `@${username}`, date }) : `@${username}`;
});
const open = ref(false);
const errorKey = ref('');
const visible = reactive({ currentPassword: false, newPassword: false, confirmPassword: false });
const actionKey = computed(() => hasPassword.value ? 'settings.password.change' : 'settings.password.set');
const fields = computed(() => {
  const keys: (keyof ChangePasswordInput)[] = ['newPassword', 'confirmPassword'];
  if (hasPassword.value) keys.unshift('currentPassword');
  return keys;
});

const { handleSubmit, isSubmitting, resetForm, setFieldError } = useForm<Partial<ChangePasswordInput>>({
  initialValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  validationSchema: computed(() => hasPassword.value ? changePasswordSchema : setPasswordSchema),
});

watch(open, () => {
  resetForm();
  errorKey.value = '';
  visible.currentPassword = false;
  visible.newPassword = false;
  visible.confirmPassword = false;
});

const savePassword = handleSubmit(async ({ currentPassword, newPassword, confirmPassword }) => {
  errorKey.value = '';
  try {
    const response = await apiRequest<ApiResponse<PasswordUpdatePayload>>(passwordRoutes.MY_PASSWORD, {
      method: 'PATCH',
      body: {
        newPassword,
        confirmPassword,
        ...(hasPassword.value ? { currentPassword } : {}),
      },
    });
    if (!response.success) throw response;
    open.value = false;
    toast.success(t('settings.password.saved'));
    await props.refresh();
  } catch (error) {
    const parsed = parseApiError(error);
    if (parsed.code === 'INVALID_CURRENT_PASSWORD') {
      setFieldError('currentPassword', 'validation.current_password_incorrect');
    } else if (
      parsed.code === 'PASSWORD_SET_CONFLICT' || (!hasPassword.value && parsed.fieldErrors.currentPassword?.length)
    ) {
      resetForm();
      errorKey.value = 'settings.password.set_conflict';
      await props.refresh();
    } else {
      let hasFieldError = false;
      for (const field of fields.value) {
        const message = parsed.fieldErrors[field]?.[0];
        if (message) {
          setFieldError(field, message);
          hasFieldError = true;
        }
      }
      if (!hasFieldError) errorKey.value = 'settings.password.save_failed';
    }
  }
});
</script>

<template>
  <SecurityCard
    :title="t('settings.password.title')"
    :description="t('settings.password.description')"
    :status="t(hasPassword ? 'settings.password.status_set' : 'settings.password.status_unset')"
    :positive="hasPassword"
  >
    <SecurityRow :title="t('settings.password.title')" :description="passwordDescription">
      <template #icon><Lock aria-hidden="true" /></template>
      <template #actions>
        <Dialog v-model:open="open">
          <DialogTrigger as-child>
            <Button type="button" variant="outline" :disabled="isSubmitting">
              {{ t(hasPassword ? 'settings.password.change_action' : 'settings.password.set') }}
            </Button>
          </DialogTrigger>
          <DialogContent
            class="max-h-[calc(100dvh-2rem)] overflow-y-auto"
            :show-close-button="false"
            @escape-key-down="(event) => { if (isSubmitting) event.preventDefault(); }"
            @interact-outside="(event) => { if (isSubmitting) event.preventDefault(); }"
          >
            <DialogHeader>
              <DialogTitle>{{ t(actionKey) }}</DialogTitle>
              <DialogDescription>
                {{ t(hasPassword ? 'settings.password.change_description' : 'settings.password.set_description') }}
              </DialogDescription>
            </DialogHeader>

            <form class="flex flex-col gap-4" novalidate @submit="savePassword">
              <Alert v-if="errorKey" variant="destructive" role="alert">
                <AlertDescription>{{ t(errorKey) }}</AlertDescription>
              </Alert>
              <FieldGroup>
                <VeeField v-for="name in fields" :key="name" v-slot="{ field, errors }" :name="name">
                  <Field :data-invalid="!!errors.length">
                    <FieldLabel :for="`settings-${name}`">{{ t(`settings.password.${name}`) }}</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        :id="`settings-${name}`"
                        :model-value="field.value"
                        :type="visible[name] ? 'text' : 'password'"
                        :autocomplete="name === 'currentPassword' ? 'current-password' : 'new-password'"
                        :disabled="isSubmitting"
                        :aria-invalid="!!errors.length"
                        :aria-describedby="errors.length || name === 'newPassword' ? `settings-${name}-help` : undefined"
                        @update:model-value="field.onChange"
                        @blur="field.onBlur"
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          type="button"
                          size="icon-sm"
                          :aria-label="t(visible[name] ? 'settings.password.hide_field' : 'settings.password.show_field', { field: t(`settings.password.${name}`) })"
                          @click="visible[name] = !visible[name]"
                        >
                          <EyeOff v-if="visible[name]" aria-hidden="true" />
                          <Eye v-else aria-hidden="true" />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <div v-if="errors.length || name === 'newPassword'" :id="`settings-${name}-help`">
                      <FieldError
                        v-if="errors.length"
                        :errors="errors.map((key) => t(te(key) ? key : 'settings.password.invalid_field'))"
                      />
                      <FieldDescription v-else>{{ t('settings.password.requirements') }}</FieldDescription>
                    </div>
                  </Field>
                </VeeField>
              </FieldGroup>

              <DialogFooter>
                <DialogClose as-child>
                  <Button type="button" variant="outline" :disabled="isSubmitting">{{ t('settings.cancel') }}</Button>
                </DialogClose>
                <Button type="submit" :disabled="isSubmitting">
                  <Spinner v-if="isSubmitting" data-icon="inline-start" aria-hidden="true" />
                  {{ t(actionKey) }}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </template>
    </SecurityRow>
  </SecurityCard>
</template>
