import type { SessionUser, User } from '#layers/auth/types/auth';

export interface OnboardingStep {
  id: string;
  order: number;
  isApplicable(user: User): boolean | Promise<boolean>;
}

export interface OnboardingStepsData {
  steps: string[];
}

export interface OnboardingStatusData extends OnboardingStepsData {
  pending: boolean;
}

export interface OnboardingCompleteData {
  pending: false;
}

export interface OnboardingStepProps {
  user: SessionUser;
}

export interface OnboardingStepEmits {
  /** Save the step's own data first, then let the wizard record completion. */
  done: [];
  back: [];
}

export type OnboardingPendingInput = Partial<Pick<User, 'onboardingPending'>>;
