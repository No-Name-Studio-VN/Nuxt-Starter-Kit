<script setup lang="ts">
import { toast } from 'vue-sonner';
import TwoFactorBackupCodes from './TwoFactorBackupCodes.vue';
import TwoFactorPasswordForm from './TwoFactorPasswordForm.vue';
import { twoFactorRoutes } from '#layers/auth-2fa/shared/twoFactorRoutes';
import type { TwoFactorBackupCodesPayload } from '#layers/auth-2fa/types/twoFactor';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const emit = defineEmits<{ regenerated: []; 'status-stale': [] }>();
const { t } = useI18n();
const open = shallowRef(false);
const busy = shallowRef(false);
const backupCodes = shallowRef<string[]>();
const heading = useTemplateRef('heading');

function updateOpen(value: boolean) {
  if (busy.value || (!value && backupCodes.value)) return;
  open.value = value;
}

async function regenerate(password: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    const response = await apiRequest<ApiResponse<TwoFactorBackupCodesPayload>>(twoFactorRoutes.MY_2FA_BACKUP_CODES, {
      method: 'POST',
      body: { password },
    });
    if (!response.success) throw response;
    backupCodes.value = response.data.backupCodes;
    await nextTick();
    heading.value?.focus();
  } catch (error) {
    const { code } = parseApiError(error);
    if (code === 'INVALID_PASSWORD') return 'validation.current_password_incorrect';
    if (code === 'TWO_FACTOR_NOT_ENABLED' || code === 'TWO_FACTOR_CHANGED') {
      open.value = false;
      emit('status-stale');
      toast.error(t('settings.two_factor.regenerate_stale'));
    } else {
      toast.error(t('settings.two_factor.regenerate_failed'));
    }
  } finally {
    busy.value = false;
  }
}

function finish() {
  open.value = false;
  backupCodes.value = undefined;
  emit('regenerated');
}
</script>

<template>
  <Dialog :open="open" @update:open="updateOpen">
    <DialogTrigger as-child>
      <Button type="button" variant="outline">{{ t('settings.two_factor.regenerate') }}</Button>
    </DialogTrigger>
    <DialogContent
      :show-close-button="false"
      class="max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto sm:max-w-md"
      @escape-key-down="(event) => { if (busy || backupCodes) event.preventDefault(); }"
      @interact-outside="(event) => { if (busy || backupCodes) event.preventDefault(); }"
    >
      <DialogHeader>
        <DialogTitle>
          <span ref="heading" class="outline-none" tabindex="-1">
            {{ t(backupCodes ? 'settings.two_factor.backup_title' : 'settings.two_factor.regenerate_title') }}
          </span>
        </DialogTitle>
        <DialogDescription>
          {{ t(backupCodes ? 'settings.two_factor.backup_description' : 'settings.two_factor.regenerate_description') }}
        </DialogDescription>
      </DialogHeader>
      <TwoFactorBackupCodes v-if="backupCodes" :backup-codes="backupCodes" @done="finish" />
      <TwoFactorPasswordForm
        v-else
        :action-label="t('settings.two_factor.regenerate')"
        :busy="busy"
        :submit-password="regenerate"
        @cancel="updateOpen(false)"
      />
    </DialogContent>
  </Dialog>
</template>
