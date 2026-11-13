import '#layers/auth/types/extensions';
import { defineAsyncComponent } from 'vue';

/**
 * The authenticator-code step a password sign-in with 2FA is sent to
 * (`/auth/login?step=2fa`). Loaded only when the step renders, so other pages
 * do not ship the OTP input.
 */
export default defineNuxtPlugin(() => {
  registerExtension('auth:login:steps', {
    id: '2fa',
    order: 100,
    component: defineAsyncComponent(() => import('../components/auth/TwoFactorLoginStep.vue')),
  });
});
