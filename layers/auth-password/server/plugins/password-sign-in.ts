import { registerSignInMethod } from '#layers/auth/server/utils/signInMethods';
import userPasswordService from '#layers/auth-password/server/utils/database/userPassword';

export default defineNitroPlugin(() => {
  registerSignInMethod({
    id: 'password',
    async countCredentials(userId) {
      return (await userPasswordService.hasPassword(userId)) ? 1 : 0;
    },
    setSecret: (userId, secret) => userPasswordService.set(userId, secret),
  });
});
