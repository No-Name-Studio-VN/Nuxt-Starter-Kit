import userService from '#layers/auth/server/utils/database/user';
import { registerLoginPolicy } from '#layers/auth/server/utils/loginPolicies';
import { authRoutes } from '#layers/auth/shared/authRoutes';

/**
 * Auth's own password sign-in policy. Installed layers can run before or after
 * this check, so accounts stopped by an earlier policy get the same
 * answer as before those checks became policies.
 */
export default defineNitroPlugin(() => {
  registerLoginPolicy({
    id: 'account-lock',
    order: 150,
    async run({ event, user }) {
      if (user.isLocked) {
        return {
          kind: 'respond',
          body: sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=account-locked'),
        };
      }

      // Recorded before any second-factor challenge, so a sign-in that stops
      // there still counts as the last login.
      await userService.update({ id: user.id, lastLoginAt: new Date() });

      return { kind: 'continue' };
    },
  });
});
