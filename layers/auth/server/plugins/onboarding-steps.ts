import { registerOnboardingStep } from '#layers/auth/server/utils/onboardingSteps';
import { getSignInMethod } from '#layers/auth/server/utils/signInMethods';

export default defineNitroPlugin(() => {
  registerOnboardingStep({
    id: 'username',
    order: 100,
    isApplicable: async (user) => (await getSignInMethod('password')?.countCredentials(user.id) ?? 0) === 0,
  });

  registerOnboardingStep({
    id: 'preferences',
    order: 900,
    isApplicable: () => true,
  });
});
