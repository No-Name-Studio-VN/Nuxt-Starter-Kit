import { registerLoginPolicy } from '#layers/auth/server/utils/loginPolicies';
import { authRoutes } from '#layers/auth/shared/authRoutes';

/**
 * Stops every sign-in method for a locked account. Installed layers can run
 * before or after this check, so accounts stopped by an earlier policy get the
 * same answer as before those checks became policies.
 */
export default defineNitroPlugin(() => {
  registerLoginPolicy({
    id: 'account-lock',
    order: 150,
    async run({ event, user, method }) {
      if (!user.isLocked) {
        return { kind: 'continue' };
      }

      // The password form posts natively and has always been answered with this
      // redirect; other methods answer a deny in their own transport.
      if (method === 'password') {
        return {
          kind: 'respond',
          body: sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=account-locked'),
        };
      }

      return {
        kind: 'deny',
        error: {
          status: 403,
          statusText: 'Forbidden',
          message: 'Forbidden. This account is locked.',
          code: 'ACCOUNT_LOCKED',
        },
      };
    },
  });
});
