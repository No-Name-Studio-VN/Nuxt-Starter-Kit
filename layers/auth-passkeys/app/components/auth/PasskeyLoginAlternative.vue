<script setup lang="ts">
import { Fingerprint } from '@lucide/vue';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { LoginAlternativeEmits, LoginAlternativeProps, LoginAlternativeSlots } from '#layers/auth-password/types/loginAlternatives';
import { authenticatePasskey } from '#layers/auth-passkeys/app/utils/authenticatePasskey';

const props = defineProps<LoginAlternativeProps>();
const emit = defineEmits<LoginAlternativeEmits>();
defineSlots<LoginAlternativeSlots>();

const { t } = useI18n();

const { authenticate } = useWebAuthn();

async function signInWithPasskey() {
  if (!props.username.trim()) {
    emit('error', t('auth.passkey.username_required'));
    return;
  }

  if (props.pending) return;
  emit('pending', true);

  try {
    if (!await authenticatePasskey(props.username, authenticate)) {
      emit('error', t('auth.passkey.sign_in_failed'));
      emit('pending', false);
      return;
    }
    emit('done', props.redirectTo);
  } catch (err) {
    emit(
      'error',
      parseApiError(
        err,
        t('auth.passkey.sign_in_failed'),
      ).message,
    );
    emit('pending', false);
  }
}
</script>

<template>
  <slot :sign-in="signInWithPasskey">
    <Button
      type="button"
      variant="outline"
      class="h-10 w-full"
      :disabled="!username.trim()"
      :is-loading="pending"
      @click="signInWithPasskey"
    >
      <Fingerprint aria-hidden="true" class="size-4" />
      {{ t('auth.passkey.sign_in') }}
    </Button>
  </slot>
</template>
