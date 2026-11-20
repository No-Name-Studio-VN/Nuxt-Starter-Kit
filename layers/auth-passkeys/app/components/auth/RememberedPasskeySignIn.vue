<script setup lang="ts">
import { Fingerprint } from '@lucide/vue';
import PasskeyLoginAlternative from './PasskeyLoginAlternative.vue';
import AuthLastSignInTile from '#layers/auth/app/components/auth/AuthLastSignInTile.vue';
import type { RememberedSignInEmits, RememberedSignInProps } from '#layers/auth/types/lastSignIn';

defineProps<RememberedSignInProps>();
const emit = defineEmits<RememberedSignInEmits>();

onMounted(() => {
  if (!window.PublicKeyCredential) emit('unavailable');
});
</script>

<template>
  <PasskeyLoginAlternative
    v-slot="{ signIn }"
    :username="record.username"
    :redirect-to="redirectTo"
    :pending="pending"
    @done="emit('done', $event)"
    @pending="emit('pending', $event)"
    @error="emit('error', $event)"
  >
    <AuthLastSignInTile
      :record="record"
      :label="$t('auth.passkey.last_sign_in', { username: record.username })"
      :pending="pending"
      @continue="signIn"
      @alternate="emit('alternate')"
      @forget="emit('forget')"
    >
      <template #icon><Fingerprint class="size-3" /></template>
    </AuthLastSignInTile>
  </PasskeyLoginAlternative>
</template>
