import { resolveOnboardingSteps } from '#layers/auth/server/utils/onboardingSteps';
import { refreshOnboardingSession, requireOnboardingUser } from '#layers/auth/server/utils/onboardingUser';
import type { OnboardingStatusData } from '#layers/auth/types/onboarding';
import { success } from '#layers/server-core/server/utils/apiResponse';

export default defineEventHandler(async (event) => {
  const { user, sessionUser } = await requireOnboardingUser(event);
  await refreshOnboardingSession(event, user, sessionUser);

  const steps = await resolveOnboardingSteps(user);

  return success<OnboardingStatusData>({
    pending: user.onboardingPending,
    steps,
  });
});
