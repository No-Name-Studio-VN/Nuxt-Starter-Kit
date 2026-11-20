<script setup lang="ts">
import { KeyRound, Smartphone } from '@lucide/vue';
import { Progress } from '@/components/ui/progress';
import { formatDate, formatNumber } from '@/lib/utils';
import TwoFactorDisableDialog from './TwoFactorDisableDialog.vue';
import TwoFactorRegenerateDialog from './TwoFactorRegenerateDialog.vue';
import TwoFactorSetupDialog from './TwoFactorSetupDialog.vue';
import SecurityCard from '#layers/auth/app/components/settings/SecurityCard.vue';
import SecurityRow from '#layers/auth/app/components/settings/SecurityRow.vue';
import SecurityStatusPill from '#layers/auth/app/components/settings/SecurityStatusPill.vue';
import { twoFactorRoutes } from '#layers/auth-2fa/shared/twoFactorRoutes';
import type { TwoFactorStatusPayload } from '#layers/auth-2fa/types/twoFactor';
import type { SettingsSectionProps } from '#layers/auth/types/settings';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import type { ApiResponse } from '#layers/server-core/types/api';

const props = defineProps<SettingsSectionProps>();
const { t, locale } = useI18n();
const section = useTemplateRef('section');
const { data, status, refresh } = useLazyAsyncData(
  () => `settings:two-factor:${props.profile.id}`,
  async (_nuxtApp, { signal }) => {
    const response = await apiRequest<ApiResponse<TwoFactorStatusPayload>>(twoFactorRoutes.MY_2FA_STATUS, { signal });
    if (!response.success) throw response;
    return response.data;
  },
  { server: false },
);

const statusLabel = computed(() => {
  if (status.value === 'error') return t('settings.two_factor.unavailable');
  if (!data.value) return t('settings.two_factor.checking');
  return t(data.value.enabled ? 'settings.two_factor.enabled' : 'settings.two_factor.disabled');
});

const authenticatorDescription = computed(() => {
  if (!data.value?.enabled) {
    return t(props.profile.hasPassword
      ? 'settings.two_factor.authenticator_examples'
      : 'settings.two_factor.password_required');
  }
  const date = formatDate(data.value.enabledAt, locale.value);
  return date ? t('settings.two_factor.authenticator_added', { date }) : undefined;
});

const backupCodesDescription = computed(() => {
  if (!data.value?.enabled) return t('settings.two_factor.backup_unavailable');
  return t('settings.two_factor.backup_remaining', {
    remaining: formatNumber(data.value.backupCodesRemaining, locale.value),
    total: formatNumber(data.value.backupCodesTotal, locale.value),
  });
});

const backupCodesProgress = computed(() => {
  if (!data.value?.backupCodesTotal) return 0;
  return Math.min(100, data.value.backupCodesRemaining / data.value.backupCodesTotal * 100);
});

async function updateStatus() {
  await refresh();
  await nextTick();
  section.value?.focus({ preventScroll: true });
}
</script>

<template>
  <div
    ref="section"
    role="group"
    tabindex="-1"
    :aria-label="`${t('settings.two_factor.title')}: ${statusLabel}`"
  >
    <SecurityCard
      :title="t('settings.two_factor.title')"
      :description="t('settings.two_factor.scope')"
      :status="statusLabel"
      :positive="status !== 'error' && data?.enabled"
    >
      <template v-if="status === 'error' || !data" #before>
        <div v-if="status === 'error'" class="px-5 py-3">
          <Alert variant="destructive" role="alert">
            <AlertDescription class="flex flex-wrap items-center gap-2">
              {{ t('settings.two_factor.status_failed') }}
              <Button type="button" variant="outline" size="sm" @click="updateStatus">
                {{ t('settings.retry') }}
              </Button>
            </AlertDescription>
          </Alert>
        </div>
        <div v-else class="px-5 py-3" role="status">
          <span class="sr-only">{{ t('settings.two_factor.loading') }}</span>
          <Skeleton class="h-5 w-20 motion-reduce:animate-none" />
        </div>
      </template>
      <template v-else #default>
        <SecurityRow
          :title="t('settings.two_factor.authenticator_app')"
          :description="authenticatorDescription"
        >
          <template #icon><Smartphone aria-hidden="true" /></template>
          <template #actions>
            <template v-if="data.enabled">
              <SecurityStatusPill positive>{{ t('settings.two_factor.active') }}</SecurityStatusPill>
              <TwoFactorDisableDialog @disabled="updateStatus" />
            </template>
            <TwoFactorSetupDialog
              v-else
              :disabled="!profile.hasPassword"
              @enabled="updateStatus"
              @status-stale="updateStatus"
            />
          </template>
        </SecurityRow>
        <SecurityRow
          :title="t('settings.two_factor.backup_codes')"
          :description="backupCodesDescription"
          :dimmed="!data.enabled"
        >
          <template #icon><KeyRound aria-hidden="true" /></template>
          <template v-if="data.enabled" #extra>
            <Progress
              :model-value="backupCodesProgress"
              :get-value-label="() => t('settings.two_factor.backup_codes')"
              :get-value-text="() => backupCodesDescription"
              class="mt-1 h-1.5 w-30 max-w-full bg-muted [&_[data-slot=progress-indicator]]:bg-green-700 motion-reduce:[&_[data-slot=progress-indicator]]:transition-none"
            />
          </template>
          <template v-if="data.enabled" #actions>
            <TwoFactorRegenerateDialog @regenerated="refresh()" @status-stale="updateStatus" />
          </template>
        </SecurityRow>
      </template>
    </SecurityCard>
  </div>
</template>
