import type { SidebarNavRecord } from '#layers/dashboard/types/sidebar';

declare module '~~/types/extensions' {
  interface ExtensionSlots {
    /** User controls at the top of the sidebar. Entries can emit `navigate` to reset its context. */
    'sidebar:user': true;
    'sidebar:footer': true;
    'dashboard:header:actions': true;
  }

  interface NavMenus {
    sidebar: SidebarNavRecord;
  }
}
