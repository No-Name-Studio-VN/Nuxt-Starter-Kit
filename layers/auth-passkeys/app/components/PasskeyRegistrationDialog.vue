<script setup lang="ts">
import { Fingerprint } from '@lucide/vue';
import type { PasskeyRegistrationProps } from '#layers/auth-passkeys/types/passkeyRegistration';
import { parseApiError } from '#layers/server-core/app/utils/apiError';

const props = defineProps<PasskeyRegistrationProps>();
const emit = defineEmits<{
  'update:open': [value: boolean];
  'passkey-created': [];
  'skip-passkey': [];
}>();

const { t } = useI18n();
const { register, isSupported } = useWebAuthn({ registerEndpoint: props.registerEndpoint });
const isLoading = shallowRef(false);
const errorKey = shallowRef('');

watch(() => props.open, () => {
  errorKey.value = '';
});

function updateOpen(open: boolean) {
  if (!isLoading.value) emit('update:open', open);
}

async function createPasskey() {
  if (isLoading.value || !isSupported.value) return;
  if (!props.username.trim()) {
    errorKey.value = 'settings.passkeys.missing_username';
    return;
  }

  isLoading.value = true;
  errorKey.value = '';

  try {
    const verified = await register({
      userName: props.username,
      displayName: props.displayName?.trim() || props.username,
    });
    if (!verified) {
      errorKey.value = 'settings.passkeys.add_failed';
      return;
    }
    emit('passkey-created');
    emit('update:open', false);
  } catch (error) {
    const { code } = parseApiError(error);
    if (code === 'PASSKEY_ALREADY_EXISTS' || code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
      errorKey.value = 'settings.passkeys.already_registered';
    } else if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
      errorKey.value = 'settings.passkeys.add_canceled';
    } else {
      errorKey.value = 'settings.passkeys.add_failed';
    }
  } finally {
    isLoading.value = false;
  }
}

function skipPasskey() {
  emit('skip-passkey');
  emit('update:open', false);
}
</script>

<template>
  <Dialog :open="open" @update:open="updateOpen">
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>
    <DialogContent
      :show-close-button="false"
      class="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
      @escape-key-down="(event) => { if (isLoading) event.preventDefault(); }"
      @interact-outside="(event) => { if (isLoading) event.preventDefault(); }"
    >
      <DialogHeader>
        <DialogTitle>{{ t('settings.passkeys.add') }}</DialogTitle>
        <DialogDescription>{{ t('settings.passkeys.add_description') }}</DialogDescription>
      </DialogHeader>
      <Alert v-if="errorKey || !isSupported" variant="destructive" role="alert">
        <AlertDescription>{{ t(errorKey || 'settings.passkeys.unsupported') }}</AlertDescription>
      </Alert>
      <DialogFooter>
        <DialogClose v-if="registerEndpoint" as-child>
          <Button type="button" variant="outline" :disabled="isLoading">{{ t('settings.cancel') }}</Button>
        </DialogClose>
        <Button v-else type="button" variant="outline" :disabled="isLoading" @click="skipPasskey">
          {{ t('settings.passkeys.skip') }}
        </Button>
        <Button type="button" :disabled="isLoading || !isSupported" @click="createPasskey">
          <Spinner v-if="isLoading" data-icon="inline-start" aria-hidden="true" />
          <Fingerprint v-else data-icon="inline-start" aria-hidden="true" />
          {{ t('settings.passkeys.add') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
