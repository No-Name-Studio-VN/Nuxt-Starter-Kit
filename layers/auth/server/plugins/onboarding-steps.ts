import { registerOnboardingStep } from '#layers/auth/server/utils/onboardingSteps';
import { hasPassword } from '#layers/auth/server/utils/hasPassword';

export default defineNitroPlugin(() => {
  registerOnboardingStep({
    id: 'username',
    order: 100,
    isApplicable: (user) => !hasPassword(user),
  });

  registerOnboardingStep({
    id: 'preferences',
    order: 900,
    isApplicable: () => true,
  });
});
