<script setup lang="ts">
import { toast } from 'vue-sonner';
import TwoFactorPasswordForm from './TwoFactorPasswordForm.vue';
import { twoFactorRoutes } from '#layers/auth-2fa/shared/twoFactorRoutes';
import type { PasswordUpdatePayload } from '#layers/auth/types/userSecurity';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const emit = defineEmits<{ disabled: [] }>();
const { t } = useI18n();
const open = shallowRef(false);
const busy = shallowRef(false);

function updateOpen(value: boolean) {
  if (!busy.value) open.value = value;
}

async function disable(password: string) {
  if (busy.value) return;
  busy.value = true;

  try {
    const response = await apiRequest<ApiResponse<PasswordUpdatePayload>>(twoFactorRoutes.MY_2FA_DISABLE, {
      method: 'DELETE',
      body: { password },
    });
    if (!response.success) throw response;
    open.value = false;
    toast.success(t('settings.two_factor.disabled_toast'));
    emit('disabled');
  } catch (error) {
    const { code } = parseApiError(error);
    if (code === 'INVALID_PASSWORD') return 'validation.current_password_incorrect';
    toast.error(t('settings.two_factor.disable_failed'));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AlertDialog :open="open" @update:open="updateOpen">
    <AlertDialogTrigger as-child>
      <Button type="button" variant="ghost" class="text-destructive hover:text-destructive">
        {{ t('settings.two_factor.remove') }}
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent class="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('settings.two_factor.disable_title') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('settings.two_factor.disable_description') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <TwoFactorPasswordForm
        :action-label="t('settings.two_factor.disable')"
        :busy="busy"
        :submit-password="disable"
        destructive
      >
        <template #cancel>
          <AlertDialogCancel :disabled="busy">{{ t('settings.cancel') }}</AlertDialogCancel>
        </template>
      </TwoFactorPasswordForm>
    </AlertDialogContent>
  </AlertDialog>
</template>
