import '#layers/auth/types/extensions';
import OAuthButtons from '#layers/auth-oauth/app/components/OAuthButtons.vue';
import RememberedOAuthSignIn from '#layers/auth-oauth/app/components/auth/RememberedOAuthSignIn.vue';
import { useReadyOAuthProviderList } from '#layers/auth-oauth/app/composables/useReadyOAuthProviders';

export default defineNuxtPlugin(() => {
  const entry = {
    id: 'oauth',
    order: 100,
    component: OAuthButtons,
    useAvailable: () => {
      const { providers, status } = useReadyOAuthProviderList();
      return computed(() => providers.value.length > 0 || status.value !== 'success');
    },
  };
  registerExtension('auth:login:methods', entry);
  registerExtension('auth:login:remembered', { id: 'oauth', order: 100, component: RememberedOAuthSignIn });
  registerExtension('auth:register:methods', entry);
});
