import userService from '#layers/auth/server/utils/database/user';
import { registerSignInMethod } from '#layers/auth/server/utils/signInMethods';

export default defineNitroPlugin(() => {
  registerSignInMethod({
    id: 'password',
    async countCredentials(userId) {
      const user = await userService.getById(userId);
      return user?.password.trim() ? 1 : 0;
    },
  });
});
