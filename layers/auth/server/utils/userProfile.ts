import { apiError } from '#layers/server-core/server/utils/apiResponse';
import oauthAccountService from '#layers/auth/server/utils/database/oauthAccount';
import userService from '#layers/auth/server/utils/database/user';
import { hasPassword } from '#layers/auth/server/utils/hasPassword';
import { getContributedSignInMethodCount } from '#layers/auth/server/utils/signInMethods';
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

  const [oauthAccounts, contributedSignInMethodCount] = await Promise.all([
    oauthAccountService.getByUserId(userId),
    getContributedSignInMethodCount(userId),
  ]);

  return {
    id: dbUser.id,
    username: dbUser.username,
    name: dbUser.name,
    email: dbUser.email,
    emailVerified: dbUser.emailVerified,
    createdAt: dbUser.createdAt || new Date(),
    lastLoginAt: dbUser.lastLoginAt || dbUser.createdAt || new Date(),
    hasPassword: hasPassword(dbUser),
    contributedSignInMethodCount,
    passwordChangedAt: dbUser.passwordChangedAt,
    isAdmin: dbUser.isAdmin,
    linkedAccounts: oauthAccounts.map((account) => ({
      provider: account.provider,
      email: account.email,
      name: account.name,
      avatarUrl: account.avatarUrl,
      linkedAt: account.createdAt || new Date(),
    })),
  };
}
