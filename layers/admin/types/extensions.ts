import type { AdminCardRecord } from '#layers/admin/types/adminCards';

declare module '~~/types/extensions' {
  interface NavMenus {
    adminCards: AdminCardRecord;
  }
}
