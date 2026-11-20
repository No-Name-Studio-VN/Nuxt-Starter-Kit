import { registerOAuthLinkPolicy } from '#layers/auth/server/utils/oauthLinkPolicies';
import userTwoFactorService from '#layers/auth-2fa/server/utils/database/userTwoFactor';

export default defineNitroPlugin(() => {
  registerOAuthLinkPolicy({
    id: 'two-factor',
    order: 200,
    async run({ user }) {
      const twoFactor = await userTwoFactorService.getById(user.id);
      return { allow: !twoFactor?.enabled };
    },
  });
});
