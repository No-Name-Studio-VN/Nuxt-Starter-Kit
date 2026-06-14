import { getAuthorizedUserId } from '~~/server/utils/authorization'
import userService from '~~/server/utils/database/user'
import oauthAccountService from '~~/server/utils/database/oauthAccount'
import { apiError, success } from '~~/server/utils/apiResponse'
import type { UserProfileModel } from '~~/types/models/profile'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event)
  const dbUser = await userService.getById(userId)

  if (!dbUser) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'User not found.',
      code: 'USER_NOT_FOUND',
    })
  }

  const [linkedAccounts, passkeys] = await Promise.all([
    oauthAccountService.getByUserId(userId),
    useDB()
      .select({ id: tables.credentials.id })
      .from(tables.credentials)
      .where(eq(tables.credentials.userId, userId))
      .all(),
  ])

  const userProfile: UserProfileModel = {
    id: dbUser.id,
    username: dbUser.username,
    name: dbUser.name,
    email: dbUser.email,
    emailVerified: dbUser.emailVerified,
    createdAt: dbUser.createdAt || new Date(),
    lastLoginAt: dbUser.lastLoginAt || dbUser.createdAt || new Date(),
    hasPassword: !!dbUser.password && dbUser.password.trim().length > 0,
    passkeyCount: passkeys.length,
    isAdmin: dbUser.isAdmin,
    linkedAccounts: linkedAccounts.map(account => ({
      provider: account.provider,
      email: account.email,
      name: account.name,
      avatarUrl: account.avatarUrl,
      linkedAt: account.createdAt || new Date(),
    })),
  }

  return success(userProfile)
})
