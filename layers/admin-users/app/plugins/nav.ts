import '#layers/auth/types/extensions';
import '#layers/admin/types/extensions';
import { UsersIcon } from '@lucide/vue';
import type { AdminCardRecord } from '#layers/admin/types/adminCards';
import type { SidebarNavRecord } from '#layers/auth/types/sidebar';

const sidebarRecords: SidebarNavRecord[] = [
  {
    kind: 'item',
    id: 'admin.users-sales.users',
    order: 100,
    section: 'admin.users-sales',
    title: 'Users',
    url: '/admin/users',
    icon: UsersIcon,
  },
];

const adminCardRecords: AdminCardRecord[] = [
  {
    id: 'users',
    order: 100,
    title: 'Users Management',
    description: 'View, edit, and manage user accounts, roles, and permissions',
    to: '/admin/users',
    icon: UsersIcon,
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-500',
  },
];

/** The Users page in the admin sidebar and its card on the admin landing page. */
export default defineNuxtPlugin(() => {
  for (const record of sidebarRecords) {
    registerNavItem('sidebar', record);
  }

  for (const record of adminCardRecords) {
    registerNavItem('adminCards', record);
  }
});
