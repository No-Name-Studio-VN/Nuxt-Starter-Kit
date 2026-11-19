import userService from '#layers/auth/server/utils/database/user';
import oauthAccountService from '#layers/auth/server/utils/database/oauthAccount';
import { registerSignInMethod } from '#layers/auth/server/utils/signInMethods';

/** The sign-in methods whose code still lives in auth: password and OAuth. */
export default defineNitroPlugin(() => {
  registerSignInMethod({
    id: 'password',
    async countCredentials(userId) {
      // OAuth-created accounts store an empty hash.
      const user = await userService.getById(userId);
      return user?.password.trim() ? 1 : 0;
    },
  });

  registerSignInMethod({
    id: 'oauth',
    countCredentials: (userId) => oauthAccountService.countByUserId(userId),
  });
});
