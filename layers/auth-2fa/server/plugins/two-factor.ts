import userLockScreenService from '#layers/auth/server/utils/database/userLockScreen';
import { registerLoginPolicy } from '#layers/auth/server/utils/loginPolicies';
import { authRoutes } from '#layers/auth/shared/authRoutes';

/**
 * Sends a password sign-in with an authenticator app to the code step. The
 * account lock (150) has already run, so a challenged sign-in is still recorded
 * as the last login.
 */
export default defineNitroPlugin(() => {
  registerLoginPolicy({
    id: 'two-factor',
    order: 200,
    async run({ event, user, redirectTo }) {
      const lockScreen = await userLockScreenService.getById(user.id);
      if (!lockScreen?.totpEnabled || !lockScreen.totpSecret) {
        return { kind: 'continue' };
      }

      // The user id waits in the secure session until the code is checked.
      await setUserSession(event, {
        secure: {
          pending2faUserId: user.id,
        },
      });

      return {
        kind: 'respond',
        body: sendRedirect(
          event,
          authRoutes.AUTH_LOGIN + `?step=2fa&redirectTo=${encodeURIComponent(redirectTo)}`,
        ),
      };
    },
  });
});
