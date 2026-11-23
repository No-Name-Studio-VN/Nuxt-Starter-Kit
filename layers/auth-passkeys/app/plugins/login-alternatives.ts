import '#layers/auth/types/extensions';
import { defineAsyncComponent } from 'vue';

/**
 * Passkey sign-in on `/auth/login`. Renders inside the password form when
 * `auth-password` is installed, or as its own sign-in method otherwise. Loaded
 * lazily so other pages do not ship the WebAuthn browser client.
 */
export default defineNuxtPlugin(() => {
  registerExtension('auth:login:remembered', {
    id: 'passkey',
    order: 100,
    component: defineAsyncComponent(() => import('../components/auth/RememberedPasskeySignIn.vue')),
  });
  registerExtension('auth:login:alternatives', {
    id: 'passkey',
    order: 100,
    component: defineAsyncComponent(() => import('../components/auth/PasskeyLoginAlternative.vue')),
  });
  registerExtension('auth:login:methods', {
    id: 'passkey',
    order: 250,
    component: defineAsyncComponent(() => import('../components/auth/PasskeyLoginMethod.vue')),
    useAvailable: () =>
      computed(() => !getExtensions('auth:login:methods').some((entry) => entry.id === 'password')),
  });
});
