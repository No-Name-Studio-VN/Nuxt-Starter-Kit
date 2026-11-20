import type { User } from '#layers/auth/types/auth';
import type { OnboardingStep } from '#layers/auth/types/onboarding';
import { createOrderedRegistry } from '#layers/server-core/server/utils/orderedRegistry';

const onboardingSteps = createOrderedRegistry<OnboardingStep>('Onboarding step');

export function registerOnboardingStep(step: OnboardingStep): void {
  onboardingSteps.register(step);
}

export async function isOnboardingStepApplicable(user: User, id: string): Promise<boolean> {
  return onboardingSteps.get(id)?.isApplicable(user) ?? false;
}

export async function resolveOnboardingSteps(user: User): Promise<string[]> {
  const steps = onboardingSteps.list();
  const remaining: string[] = [];

  for (const step of steps) {
    if (!user.onboardingCompletedSteps.includes(step.id) && await step.isApplicable(user)) {
      remaining.push(step.id);
    }
  }

  return remaining;
}
