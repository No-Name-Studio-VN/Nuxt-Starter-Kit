import type {
  SidebarContext,
  SidebarGuardContext,
  SidebarGuardUser,
  SidebarItem,
} from '~~/types/common';
import {
  // <nsk:feature-flags>
  FlagIcon,
  // </nsk:feature-flags>
  Home,
  Info,
  LayoutDashboardIcon,
  Search,
  Settings,
  Shield,
  TicketIcon,
  User,
  UserCog2Icon,
  // <nsk:admin-users>
  UsersIcon,
  // </nsk:admin-users>
} from '@lucide/vue';

export const SIDEBAR_CONTEXTS: SidebarContext[] = [
  {
    id: 'settings',
    match: '/settings',
    variant: 'inset',
    showBack: true,
    sections: [
      {
        title: 'Account',
        items: [
          { title: 'Profile', url: '/settings/profile', icon: User },
          { title: 'Security', url: '/settings/security', icon: Shield },
        ],
      },
      {
        title: 'About',
        items: [{ title: 'About Nuxt Starter Kit', url: '/settings/about', icon: Info }],
      },
    ],
  },
  {
    id: 'admin',
    match: '/admin',
    variant: 'inset',
    showBack: true,
    guard: (user) => user?.isAdmin === true,
    sections: [
      {
        title: 'Overview',
        items: [{ title: 'Dashboard', url: '/admin', icon: LayoutDashboardIcon }],
      },
      {
        title: 'Users & Sales',
        items: [
          // <nsk:admin-users>
          { title: 'Users', url: '/admin/users', icon: UsersIcon },
          // </nsk:admin-users>
          { title: 'Coupons', url: '/admin/coupons', icon: TicketIcon },
          { title: 'Subscriptions', url: '/admin/subscriptions', icon: TicketIcon },
        ],
      },
      {
        title: 'System',
        items: [
          // <nsk:feature-flags>
          { title: 'Feature Flags', url: '/admin/feature-flags', icon: FlagIcon },
          // </nsk:feature-flags>
        ],
      },
    ],
  },
  {
    id: 'main',
    match: '/',
    sections: [
      {
        title: 'Discover',
        items: [
          { title: 'Home', url: '/', icon: Home },
          { title: 'Search', url: '/search', icon: Search },
        ],
      },
      {
        title: 'App',
        items: [{ title: 'Settings', url: '/settings/profile', icon: Settings }],
      },
      {
        title: 'Admin',
        guard: (user) => user?.isAdmin === true,
        items: [{ title: 'Admin Dashboard', url: '/admin', icon: LayoutDashboardIcon }],
      },
      {
        title: 'Support',
        secondary: true,
        items: [{ title: 'Help & Support', url: '/support', icon: UserCog2Icon }],
      },
    ],
  },
];

export function getAllSidebarItems(
  user?: SidebarGuardUser,
  context?: SidebarGuardContext,
): SidebarItem[] {
  return SIDEBAR_CONTEXTS.flatMap((ctx) => {
    if (context && ctx.guard && !ctx.guard(user, context)) {
      return [];
    }

    return ctx.sections.flatMap((section) => {
      if (context && section.guard && !section.guard(user, context)) {
        return [];
      }

      return section.items;
    });
  });
}
