import userService from '#layers/auth/server/utils/database/user';
import {
  onboardingUserNotFoundError,
  refreshOnboardingSession,
  requireOnboardingUser,
} from '#layers/auth/server/utils/onboardingUser';
import type { OnboardingCompleteData } from '#layers/auth/types/onboarding';
import { success } from '#layers/server-core/server/utils/apiResponse';

export default defineEventHandler(async (event) => {
  const { user, sessionUser } = await requireOnboardingUser(event);
  const updatedUser = user.onboardingPending
    ? await userService.update({ id: user.id, onboardingPending: false })
    : user;
  if (!updatedUser) throw onboardingUserNotFoundError();

  await refreshOnboardingSession(event, updatedUser, sessionUser);

  return success<OnboardingCompleteData>({ pending: false });
});
