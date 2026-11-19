import '#layers/auth/types/extensions';
import '#layers/dashboard/types/extensions';
// Declares the adminCards menu that the landing page reads; admin modules fill it.
import '#layers/admin/types/extensions';
import { LayoutDashboardIcon, UsersIcon } from '@lucide/vue';
import type { NavGuard } from '~~/types/extensions';
import type { UserMenuRecord } from '#layers/auth/types/userMenu';
import type { SidebarNavRecord } from '#layers/dashboard/types/sidebar';

const isAdmin: NavGuard = ({ user }) => user?.isAdmin === true;

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

const userMenuRecords: UserMenuRecord[] = [
  { id: 'admin', order: 100, title: 'Admin', to: '/admin', icon: UsersIcon, guard: isAdmin },
];

/** Admin's sidebar context and account-menu entry. */
export default defineNuxtPlugin(() => {
  for (const record of sidebarRecords) {
    registerNavItem('sidebar', record);
  }

  for (const record of userMenuRecords) {
    registerNavItem('userMenu', record);
  }
});
