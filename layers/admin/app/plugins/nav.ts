import '#layers/auth/types/extensions';
import '#layers/admin/types/extensions';
import { DatabaseIcon, LayoutDashboardIcon, UsersIcon } from '@lucide/vue';
import type { AdminCardRecord } from '#layers/admin/types/adminCards';
import type { SidebarGuard, SidebarNavRecord, UserMenuRecord } from '#layers/auth/types/sidebar';

const isAdmin: SidebarGuard = (user) => user?.isAdmin === true;

// Other modules add their admin pages as items in these sections.
const sidebarRecords: SidebarNavRecord[] = [
  {
    kind: 'context',
    id: 'admin',
    order: 200,
    match: '/admin',
    variant: 'inset',
    showBack: true,
    guard: isAdmin,
  },
  { kind: 'section', id: 'admin.overview', order: 100, context: 'admin', title: 'Overview' },
  {
    kind: 'item',
    id: 'admin.overview.dashboard',
    order: 100,
    section: 'admin.overview',
    title: 'Dashboard',
    url: '/admin',
    icon: LayoutDashboardIcon,
  },
  {
    kind: 'section',
    id: 'admin.users-sales',
    order: 200,
    context: 'admin',
    title: 'Users & Sales',
  },
  { kind: 'section', id: 'admin.system', order: 300, context: 'admin', title: 'System' },
  {
    kind: 'section',
    id: 'main.admin',
    order: 300,
    context: 'main',
    title: 'Admin',
    guard: isAdmin,
  },
  {
    kind: 'item',
    id: 'main.admin.dashboard',
    order: 100,
    section: 'main.admin',
    title: 'Admin Dashboard',
    url: '/admin',
    icon: LayoutDashboardIcon,
  },
];

// Before auth's Account entry (200).
const userMenuRecords: UserMenuRecord[] = [
  { id: 'admin', order: 100, title: 'Admin', to: '/admin', icon: UsersIcon, guard: isAdmin },
];

// The KV browser's card stays here until that module registers it itself.
const adminCardRecords: AdminCardRecord[] = [
  {
    id: 'kv',
    order: 300,
    title: 'KV Store',
    description: 'Browse and manage KV keys, values, and cache clearing controls',
    to: '/admin/kv',
    icon: DatabaseIcon,
    bgColor: 'bg-slate-500/10',
    textColor: 'text-slate-500',
  },
];

/** Admin's sidebar context, account-menu entry and landing-page cards. */
export default defineNuxtPlugin(() => {
  for (const record of sidebarRecords) {
    registerNavItem('sidebar', record);
  }

  for (const record of userMenuRecords) {
    registerNavItem('userMenu', record);
  }

  for (const record of adminCardRecords) {
    registerNavItem('adminCards', record);
  }
});
