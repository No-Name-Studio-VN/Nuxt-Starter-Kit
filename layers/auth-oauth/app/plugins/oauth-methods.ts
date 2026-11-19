import '#layers/auth/types/extensions';
import OAuthButtons from '#layers/auth-oauth/app/components/OAuthButtons.vue';
import { useReadyOAuthProviders } from '#layers/auth-oauth/app/composables/useReadyOAuthProviders';

export default defineNuxtPlugin(() => {
  const entry = {
    id: 'oauth',
    order: 100,
    component: OAuthButtons,
    useAvailable: () => {
      const providers = useReadyOAuthProviders();
      return computed(() => providers.value.length > 0);
    },
  };
  registerExtension('auth:login:methods', entry);
  registerExtension('auth:register:methods', entry);
});
