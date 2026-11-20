import userService from '#layers/auth/server/utils/database/user';
import { isOnboardingStepApplicable, resolveOnboardingSteps } from '#layers/auth/server/utils/onboardingSteps';
import { onboardingUserNotFoundError, requireOnboardingUser } from '#layers/auth/server/utils/onboardingUser';
import { onboardingStepIdSchema } from '#layers/auth/shared/schemas/onboardingSchema';
import type { OnboardingStepsData } from '#layers/auth/types/onboarding';
import { apiError, success } from '#layers/server-core/server/utils/apiResponse';

export default defineEventHandler(async (event) => {
  const { user } = await requireOnboardingUser(event);
  const result = onboardingStepIdSchema.safeParse(getRouterParam(event, 'id'));
  if (!result.success || !(await isOnboardingStepApplicable(user, result.data))) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      code: 'ONBOARDING_STEP_INVALID',
      message: 'This onboarding step is not available.',
      fieldErrors: { id: ['auth.onboarding_step_invalid'] },
    });
  }

  const id = result.data;
  const updatedUser = user.onboardingCompletedSteps.includes(id)
    ? user
    : await userService.completeOnboardingStep(user.id, id);
  if (!updatedUser) throw onboardingUserNotFoundError();

  return success<OnboardingStepsData>({ steps: await resolveOnboardingSteps(updatedUser) });
});
