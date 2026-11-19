import { registerLoginPolicy } from '#layers/auth/server/utils/loginPolicies';

/**
 * Stops every sign-in method for a locked account. Installed layers can run
 * before or after this check; each method answers the deny in its own transport.
 */
export default defineNitroPlugin(() => {
  registerLoginPolicy({
    id: 'account-lock',
    order: 150,
    async run({ user }) {
      if (!user.isLocked) {
        return { kind: 'continue' };
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
