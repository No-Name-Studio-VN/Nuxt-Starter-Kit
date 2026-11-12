<script setup lang="ts">
import { Fingerprint } from '@lucide/vue';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { LoginAlternativeEmits, LoginAlternativeProps } from '#layers/auth/types/loginSteps';

const props = defineProps<LoginAlternativeProps>();
const emit = defineEmits<LoginAlternativeEmits>();

const { authenticate } = useWebAuthn();

async function signInWithPasskey() {
  if (!props.username.trim()) {
    emit('error', 'Username is required');
    return;
  }

  emit('pending', true);

  try {
    await authenticate(props.username);
    emit('done', props.redirectTo);
  } catch (err) {
    emit(
      'error',
      parseApiError(
        err,
        'Authentication failed. Please ensure your passkey is set up correctly, or sign in with your password.',
      ).message,
    );
    emit('pending', false);
  }
}
</script>

<template>
  <Button
    type="button"
    variant="outline"
    class="w-full active:scale-[0.98]"
    :disabled="!username.trim()"
    :is-loading="pending"
    @click="signInWithPasskey"
  >
    <Fingerprint aria-hidden="true" class="size-4" />
    Sign In with a Passkey
  </Button>
</template>
