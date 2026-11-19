import type { AuthMethodProps } from '#layers/auth/types/authMethods';
import type { User } from '#auth-utils';
import type { UserMenuRecord } from '#layers/auth/types/userMenu';

declare module '~~/types/extensions' {
  interface ExtensionSlots {
    'auth:login:methods': AuthMethodProps;
    'auth:register:methods': AuthMethodProps;
    /** Other ways to sign in, rendered under the password sign-in button. */
    'auth:login:alternatives': true;
    /** Login steps; the one whose id matches `?step=` replaces the password form. */
    'auth:login:steps': true;
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
