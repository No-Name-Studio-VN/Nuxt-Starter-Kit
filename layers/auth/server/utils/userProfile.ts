import { apiError } from '#layers/server-core/server/utils/apiResponse';
import userService from '#layers/auth/server/utils/database/user';
import { getSignInMethod, listUserSignInMethods } from '#layers/auth/server/utils/signInMethods';
import type { UserProfileModel } from '#layers/auth/types/models/profile';

export async function getUserProfileById(userId: number): Promise<UserProfileModel> {
  const dbUser = await userService.getById(userId);

  if (!dbUser) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. The requested user account does not exist.',
      code: 'USER_NOT_FOUND',
    });
  }

  const password = getSignInMethod('password');

  return {
    id: dbUser.id,
    username: dbUser.username,
    name: dbUser.name,
    email: dbUser.email,
    emailVerified: dbUser.emailVerified,
    createdAt: dbUser.createdAt || new Date(),
    lastLoginAt: dbUser.lastLoginAt || dbUser.createdAt || new Date(),
    isAdmin: dbUser.isAdmin,
    passwordChangedAt: await password?.getCredentialUpdatedAt?.(userId),
    signInMethods: await listUserSignInMethods(userId),
  };
}
