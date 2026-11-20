<script setup lang="ts">
import { Plus, Trash2 } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { Item, ItemMedia } from '@/components/ui/item';
import SecurityCard from '#layers/auth/app/components/settings/SecurityCard.vue';
import PasskeyRegistrationDialog from '../PasskeyRegistrationDialog.vue';
import PasskeyList from './PasskeyList.vue';
import type { DeletePasskeyResponse, PasskeyModel } from '#layers/auth-passkeys/types/models/passkey';
import type { SettingsSectionProps } from '#layers/auth/types/settings';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

const props = defineProps<SettingsSectionProps>();
const { t } = useI18n();
const registrationOpen = shallowRef(false);
const removing = shallowRef(false);
const selectedId = shallowRef<string>();
const heading = useTemplateRef('heading');
const endpoint = computed(() => `/api/users/${props.profile.id}/passkeys`);

const { data: passkeys, status, refresh } = useLazyAsyncData(
  () => `settings:passkeys:${props.profile.id}`,
  async (_nuxtApp, { signal }) => {
    const response = await apiRequest<ApiResponse<PasskeyModel[]>>(endpoint.value, { signal });
    if (!response.success) throw response;
    return response.data;
  },
  { server: false },
);

const statusLabel = computed(() => {
  if (status.value === 'error') return t('settings.passkeys.unavailable');
  if (!passkeys.value) return t('settings.passkeys.pending');
  return t('settings.passkeys.count', passkeys.value.length);
});

const canRemovePasskey = computed(() => (
  props.profile.hasPassword || props.profile.linkedAccounts.length > 0 || props.profile.contributedSignInMethodCount > 1
));

async function refreshSignInMethods() {
  await Promise.all([refresh(), props.refresh()]);
}

function onPasskeyCreated() {
  toast.success(t('settings.passkeys.added'));
  void refreshSignInMethods();
}

function setRemoveOpen(id: string, open: boolean) {
  if (!removing.value && (!open || canRemovePasskey.value)) selectedId.value = open ? id : undefined;
}

async function removePasskey(id: string) {
  if (removing.value || !canRemovePasskey.value || id !== selectedId.value) return;
  removing.value = true;

  try {
    const response = await apiRequest<ApiResponse<DeletePasskeyResponse>>(endpoint.value, {
      method: 'DELETE',
      body: { credentialId: id },
    });
    if (!response.success) throw response;
    selectedId.value = undefined;
    passkeys.value = passkeys.value?.filter((passkey) => passkey.id !== id);
    await nextTick();
    heading.value?.focus();
    toast.success(t('settings.passkeys.removed'));
    await refreshSignInMethods();
  } catch (error) {
    const { code } = parseApiError(error);
    if (code === 'ONLY_SIGNIN_METHOD' || code === 'PASSKEY_NOT_FOUND') {
      const key = code === 'ONLY_SIGNIN_METHOD' ? 'settings.passkeys.only_sign_in' : 'settings.passkeys.not_found';
      toast.error(t(key));
      selectedId.value = undefined;
      await refreshSignInMethods();
    } else {
      toast.error(t('settings.passkeys.remove_failed'));
    }
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <SecurityCard
    :title="t('settings.passkeys.title')"
    :description="t('settings.passkeys.description')"
    :status="statusLabel"
    :positive="status !== 'error' && !!passkeys?.length"
  >
    <template #title>
      <span ref="heading" class="focus-visible:outline-ring" tabindex="-1">{{ t('settings.passkeys.title') }}</span>
    </template>
    <template #before>
      <div v-if="status === 'error'" class="px-5 py-3.5">
        <Alert variant="destructive" role="alert">
          <AlertDescription class="flex flex-wrap items-center gap-2">
            {{ t('settings.passkeys.load_failed') }}
            <Button type="button" variant="outline" size="sm" @click="refresh()">
              {{ t('settings.retry') }}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
      <div v-else-if="!passkeys" class="px-5 py-3.5" role="status">
        <span class="sr-only">{{ t('settings.passkeys.loading') }}</span>
        <Skeleton class="h-8 w-full motion-reduce:animate-none" />
      </div>
      <p v-else-if="!passkeys.length" class="px-5 py-3.5 text-sm text-muted-foreground">
        {{ t('settings.passkeys.empty') }}
      </p>
    </template>
    <template #default>
      <PasskeyList v-if="passkeys?.length" :passkeys="passkeys" :only-sign-in-method="!canRemovePasskey">
        <template #actions="{ passkey, label }">
          <AlertDialog :open="selectedId === passkey.id" @update:open="setRemoveOpen(passkey.id, $event)">
            <AlertDialogTrigger as-child>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                :aria-label="t('settings.passkeys.remove_named', { name: label })"
                :disabled="removing || registrationOpen || !canRemovePasskey"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{{ t('settings.passkeys.remove_title') }}</AlertDialogTitle>
                <AlertDialogDescription class="wrap-anywhere">
                  {{ t('settings.passkeys.remove_description', { name: label }) }}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel :disabled="removing">{{ t('settings.cancel') }}</AlertDialogCancel>
                <Button type="button" variant="destructive" :disabled="removing || !canRemovePasskey" @click="removePasskey(passkey.id)">
                  <Spinner v-if="removing" data-icon="inline-start" aria-hidden="true" />
                  {{ t('settings.passkeys.remove') }}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </template>
      </PasskeyList>
      <Item role="listitem" class="block rounded-none border-0 p-0">
        <PasskeyRegistrationDialog
          v-model:open="registrationOpen"
          :username="profile.username"
          :display-name="profile.name"
          register-endpoint="/api/webauthn/add-passkey"
          @passkey-created="onPasskeyCreated"
        >
          <template #trigger>
            <Button
              type="button"
              variant="ghost"
              class="h-auto w-full justify-start gap-3 rounded-t-none rounded-b-xl px-5 py-3 text-muted-foreground focus-visible:ring-inset motion-reduce:transition-none"
              :disabled="removing"
            >
              <ItemMedia variant="icon" class="rounded-md border-dashed bg-transparent">
                <Plus aria-hidden="true" />
              </ItemMedia>
              {{ t('settings.passkeys.add') }}
            </Button>
          </template>
        </PasskeyRegistrationDialog>
      </Item>
    </template>
  </SecurityCard>
</template>
