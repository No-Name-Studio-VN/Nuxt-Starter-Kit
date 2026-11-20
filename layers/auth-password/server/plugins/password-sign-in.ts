import authTokenService from '#layers/auth-password/server/utils/database/authToken';
import { registerSignInMethod } from '#layers/auth/server/utils/signInMethods';
import userPasswordService from '#layers/auth-password/server/utils/database/userPassword';

export default defineNitroPlugin(() => {
  registerSignInMethod({
    id: 'password',
    async countCredentials(userId) {
      return (await userPasswordService.hasPassword(userId)) ? 1 : 0;
    },
    countCredentialsQuery: (userId, exclude) => userPasswordService.countCredentialsQuery(userId, exclude),
    verifySecret: (userId, secret) => userPasswordService.verify(userId, secret),
    getCredentialUpdatedAt: (userId) => userPasswordService.getCredentialUpdatedAt(userId),
    buildEmailChangeCleanup: (userId) => authTokenService.deleteEmailBoundTokensQuery(userId),
    setSecret: (userId, secret) => userPasswordService.set(userId, secret),
    createWithSecret: (data, secret) => userPasswordService.createUser(data, secret),
    updateWithSecret: (data, secret, cleanup) => userPasswordService.updateUser(data, secret, cleanup),
  });
});
