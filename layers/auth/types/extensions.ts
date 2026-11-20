import type { AuthMethodProps } from '#layers/auth/types/authMethods';
import type { User } from '#auth-utils';
import type { SettingsSectionProps } from '#layers/auth/types/settings';
import type { OnboardingStepProps } from '#layers/auth/types/onboarding';
import type { RememberedSignInProps } from '#layers/auth/types/lastSignIn';
import type { UserMenuRecord } from '#layers/auth/types/userMenu';

declare module '~~/types/extensions' {
  interface ExtensionSlots {
    'auth:login:methods': AuthMethodProps;
    'auth:register:methods': AuthMethodProps;
    /** Links under the sign-in methods, e.g. a sign-up link from a method that registers accounts. */
    'auth:login:footer': true;
    /** Login steps; the one whose id matches `?step=` replaces the sign-in methods. */
    'auth:login:steps': true;
    'auth:login:remembered': RememberedSignInProps;
    'onboarding:steps': OnboardingStepProps;
    'settings:security:sections': SettingsSectionProps;
    'sidebar:user': true;
    'sidebar:footer': true;
    'dashboard:header:actions': true;
  }

  interface NavGuardContext {
    user?: User | null;
  }

  interface NavMenus {
    userMenu: UserMenuRecord;
  }
}
