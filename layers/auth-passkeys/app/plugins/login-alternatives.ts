import '#layers/auth/types/extensions';
import { defineAsyncComponent } from 'vue';

/**
 * The passkey button under the password sign-in. Loaded only when the login
 * form renders, so other pages do not ship the WebAuthn browser client.
 */
export default defineNuxtPlugin(() => {
  registerExtension('auth:login:alternatives', {
    id: 'passkey',
    rememberedSignInMethod: 'passkey',
    order: 100,
    component: defineAsyncComponent(() => import('../components/auth/PasskeyLoginAlternative.vue')),
  });
});
