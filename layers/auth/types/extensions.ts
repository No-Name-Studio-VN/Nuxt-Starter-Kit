import type { SidebarNavRecord, UserMenuRecord } from '#layers/auth/types/sidebar';

declare module '~~/types/extensions' {
  interface ExtensionEntry {
    /** A login alternative that also implements the LoginAlternativeSlots contract. */
    rememberedSignInMethod?: 'passkey';
  }

  interface ExtensionSlots {
    /** Other ways to sign in, rendered under the password sign-in button. */
    'auth:login:alternatives': true;
    /** Login steps; the one whose id matches `?step=` replaces the password form. */
    'auth:login:steps': true;
    /** Onboarding step components keyed by their server registry id. */
    'onboarding:steps': true;
    /** Optional cards on the security settings page, receiving SettingsSectionProps. */
    'settings:security:sections': true;
    /** Extra entries at the top of the dashboard sidebar footer. */
    'sidebar:footer': true;
  }

  interface NavMenus {
    sidebar: SidebarNavRecord;
    userMenu: UserMenuRecord;
  }
}
