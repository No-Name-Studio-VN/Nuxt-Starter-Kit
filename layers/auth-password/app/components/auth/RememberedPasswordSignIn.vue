<script setup lang="ts">
import { LockKeyhole } from '@lucide/vue';
import AuthLastSignInTile from '#layers/auth/app/components/auth/AuthLastSignInTile.vue';
import type { RememberedSignInEmits, RememberedSignInProps } from '#layers/auth/types/lastSignIn';

defineProps<RememberedSignInProps>();
const emit = defineEmits<RememberedSignInEmits>();
</script>

<template>
  <AuthLastSignInTile
    :record="record"
    :label="$t('auth_password.last_sign_in_password', { username: record.username })"
    :pending="pending"
    @continue="emit('continuePassword')"
    @alternate="emit('alternate')"
    @forget="emit('forget')"
  >
    <template #icon><LockKeyhole class="size-3" /></template>
  </AuthLastSignInTile>
</template>
