import { sendRedirect as sendNuxtRedirect } from 'nuxt/server';
import { registerLoginPolicy } from '#layers/auth/server/utils/loginPolicies';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import userTwoFactorService from '#layers/auth-2fa/server/utils/database/userTwoFactor';

/**
 * Sends a password sign-in with an authenticator app to the code step. The
 * account lock (150) has already run; the sign-in is recorded once the code
 * step finishes it.
 */
export default defineNitroPlugin(() => {
  registerLoginPolicy({
    id: 'two-factor',
    order: 200,
    methods: ['password'],
    async run({ event, user, redirectTo }) {
      const twoFactor = await userTwoFactorService.getById(user.id);
      if (!twoFactor?.enabled || !twoFactor.secret) {
        return { kind: 'continue' };
      }

      return {
        kind: 'respond',
        async respond() {
          await setUserSession(event, { secure: { pending2faUserId: user.id } });
          const path = authRoutes.AUTH_LOGIN + `?step=2fa&redirectTo=${encodeURIComponent(redirectTo)}`;
          return 'url' in event ? sendNuxtRedirect(event, path) : sendRedirect(event, path);
        },
      };
    },
  });
});
