import '#layers/auth/types/extensions';
import '#layers/admin/types/extensions';
import { FlagIcon } from '@lucide/vue';
import type { AdminCardRecord } from '#layers/admin/types/adminCards';
import type { SidebarNavRecord } from '#layers/auth/types/sidebar';

const sidebarRecords: SidebarNavRecord[] = [
  {
    kind: 'item',
    id: 'admin.system.feature-flags',
    order: 100,
    section: 'admin.system',
    title: 'Feature Flags',
    url: '/admin/feature-flags',
    icon: FlagIcon,
  },
];

const adminCardRecords: AdminCardRecord[] = [
  {
    id: 'feature-flags',
    order: 200,
    title: 'Feature Flags',
    description: 'Manage feature flags and rollouts',
    to: '/admin/feature-flags',
    icon: FlagIcon,
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-500',
  },
];

/** The Feature Flags page in the admin sidebar's System section and its card on the admin landing page. */
export default defineNuxtPlugin(() => {
  for (const record of sidebarRecords) {
    registerNavItem('sidebar', record);
  }

  for (const record of adminCardRecords) {
    registerNavItem('adminCards', record);
  }
});
