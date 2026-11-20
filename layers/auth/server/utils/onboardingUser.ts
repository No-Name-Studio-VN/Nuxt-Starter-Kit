import type { H3Event } from 'h3';
import userService from '#layers/auth/server/utils/database/user';
import { refreshSessionUser } from '#layers/auth/server/utils/sessionUser';
import type { SessionUser, User } from '#layers/auth/types/auth';
import { apiError } from '#layers/server-core/server/utils/apiResponse';

export function onboardingUserNotFoundError() {
  return apiError({
    status: 404,
    statusText: 'Not Found',
    code: 'USER_NOT_FOUND',
    message: 'Not Found. The requested user account does not exist.',
  });
}

export async function requireOnboardingUser(event: H3Event) {
  const { user: sessionUser } = await requireUserSession(event);
  const user = await userService.getById(sessionUser.id);
  if (!user) throw onboardingUserNotFoundError();

  return { user, sessionUser };
}

export async function refreshOnboardingSession(event: H3Event, user: User, sessionUser: SessionUser) {
  if (sessionUser.onboardingPending !== user.onboardingPending) {
    await refreshSessionUser(event, user, sessionUser);
  }
}
