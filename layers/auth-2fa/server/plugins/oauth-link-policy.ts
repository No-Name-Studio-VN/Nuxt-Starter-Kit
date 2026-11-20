import { and, eq, notExists, sql } from 'drizzle-orm';
import { registerOAuthLinkPolicy } from '#layers/auth/server/utils/oauthLinkPolicies';
import userTwoFactorService from '#layers/auth-2fa/server/utils/database/userTwoFactor';

export default defineNitroPlugin(() => {
  registerOAuthLinkPolicy({
    id: 'two-factor',
    order: 200,
    allowWrite(userId) {
      const row = useDB().select({ found: sql`1` }).from(tables.userTwoFactor)
        .where(and(eq(tables.userTwoFactor.userId, userId), eq(tables.userTwoFactor.enabled, true)));
      return notExists(row);
    },
    async run({ user }) {
      const twoFactor = await userTwoFactorService.getById(user.id);
      return { allow: !twoFactor?.enabled };
    },
  });
});
