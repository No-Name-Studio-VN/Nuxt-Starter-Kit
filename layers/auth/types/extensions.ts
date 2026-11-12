import type { SidebarNavRecord, UserMenuRecord } from '#layers/auth/types/sidebar';

declare module '~~/types/extensions' {
  interface ExtensionSlots {
    /** Other ways to sign in, rendered under the password sign-in button. */
    'auth:login:alternatives': true;
    /** Login steps; the one whose id matches `?step=` replaces the password form. */
    'auth:login:steps': true;
    /** Extra entries at the top of the dashboard sidebar footer. */
    'sidebar:footer': true;
  }

  interface NavMenus {
    sidebar: SidebarNavRecord;
    userMenu: UserMenuRecord;
  }
}
