<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';
import AuthLastSignInTile from '#layers/auth/app/components/auth/AuthLastSignInTile.vue';
import type { RememberedSignInEmits, RememberedSignInProps } from '#layers/auth/types/lastSignIn';
import { OAUTH_PROVIDERS } from '#layers/auth-oauth/shared/constants/oauthProviders';
import { useReadyOAuthProviderList } from '#layers/auth-oauth/app/composables/useReadyOAuthProviders';
import { useOAuthSignInPopup } from '#layers/auth-oauth/app/composables/useOAuthSignInPopup';
import OAuthIcon from '../OAuthIcon.vue';

const props = defineProps<RememberedSignInProps>();
const emit = defineEmits<RememberedSignInEmits>();
const { providers, status } = useReadyOAuthProviderList();
const { open, activeProvider } = useOAuthSignInPopup(emit);
const provider = computed(() => providers.value.find((id) => props.record.method === 'oauth' && id === props.record.provider));

watch([provider, status], ([id, state]) => {
  if (!id && (state === 'success' || state === 'error')) emit('unavailable');
}, { immediate: true });

function continueSignIn() {
  if (!props.pending && provider.value) void open(provider.value, props.redirectTo);
}
</script>

<template>
  <AuthLastSignInTile
    v-if="provider"
    :record="record"
    :label="$t('auth_oauth.last_sign_in_provider', { provider: OAUTH_PROVIDERS[provider].label })"
    :pending="pending || !!activeProvider"
    @continue="continueSignIn"
    @alternate="emit('alternate')"
    @forget="emit('forget')"
  >
    <template #icon>
      <span class="size-3"><OAuthIcon :icon="OAUTH_PROVIDERS[provider].icon" /></span>
    </template>
  </AuthLastSignInTile>
  <Skeleton v-else class="min-h-52 motion-reduce:animate-none" aria-hidden="true" />
</template>
