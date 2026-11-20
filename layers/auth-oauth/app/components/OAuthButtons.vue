<script setup lang="ts">
import type { AuthMethodEmits, AuthMethodProps } from '#layers/auth/types/authMethods';
import { OAUTH_PROVIDERS } from '#layers/auth-oauth/shared/constants/oauthProviders';
import type { OAuthProviderId } from '#layers/auth-oauth/types/providers';
import { useReadyOAuthProviderList } from '#layers/auth-oauth/app/composables/useReadyOAuthProviders';
import { useOAuthSignInPopup } from '#layers/auth-oauth/app/composables/useOAuthSignInPopup';

const props = defineProps<AuthMethodProps>();
const emit = defineEmits<AuthMethodEmits>();
const { providers, status, refresh } = useReadyOAuthProviderList();
const { open, activeProvider: oauthLoadingProvider } = useOAuthSignInPopup(emit);
const labelKey = computed(() =>
  props.mode === 'register' ? 'auth_oauth.sign_up_with' : 'auth_oauth.continue_with',
);

function signInWithProvider(provider: OAuthProviderId) {
  if (!props.pending) void open(provider, props.redirectTo);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="status === 'error'" class="flex items-center gap-2" role="status">
      <p class="text-sm text-muted-foreground">{{ $t('auth_oauth.unavailable') }}</p>
      <Button type="button" variant="outline" size="sm" :disabled="pending" @click="refresh()">
        {{ $t('settings.retry') }}
      </Button>
    </div>
    <Skeleton v-else-if="status === 'pending' || status === 'idle'" class="h-10" aria-hidden="true" />
    <Button
      v-for="provider in providers"
      :key="provider"
      type="button"
      variant="outline"
      class="h-10 w-full"
      :is-loading="oauthLoadingProvider === provider"
      :disabled="pending || !!oauthLoadingProvider"
      @click="signInWithProvider(provider)"
    >
      <div class="flex size-4 items-center justify-center">
        <OAuthIcon :icon="OAUTH_PROVIDERS[provider].icon" />
      </div>
      {{ $t(labelKey, { provider: OAUTH_PROVIDERS[provider].label }) }}
    </Button>
  </div>
</template>
