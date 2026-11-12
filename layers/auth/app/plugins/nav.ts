import '#layers/auth/types/extensions';
import { Home, Info, LogIn, Search, Settings, Shield, User, UserCog2Icon } from '@lucide/vue';
import type { SidebarNavRecord, UserMenuRecord } from '#layers/auth/types/sidebar';

const sidebarRecords: SidebarNavRecord[] = [
  {
    kind: 'context',
    id: 'settings',
    order: 100,
    match: '/settings',
    variant: 'inset',
    showBack: true,
  },
  { kind: 'section', id: 'settings.account', order: 100, context: 'settings', title: 'Account' },
  {
    kind: 'item',
    id: 'settings.account.profile',
    order: 100,
    section: 'settings.account',
    title: 'Profile',
    url: '/settings/profile',
    icon: User,
  },
  {
    kind: 'item',
    id: 'settings.account.security',
    order: 200,
    section: 'settings.account',
    title: 'Security',
    url: '/settings/security',
    icon: Shield,
  },
  { kind: 'section', id: 'settings.about', order: 200, context: 'settings', title: 'About' },
  {
    kind: 'item',
    id: 'settings.about.about',
    order: 100,
    section: 'settings.about',
    title: 'About Nuxt Starter Kit',
    url: '/settings/about',
    icon: Info,
  },
  // After settings (100) and admin (200).
  { kind: 'context', id: 'main', order: 300, match: '/' },
  { kind: 'section', id: 'main.discover', order: 100, context: 'main', title: 'Discover' },
  {
    kind: 'item',
    id: 'main.discover.home',
    order: 100,
    section: 'main.discover',
    title: 'Home',
    url: '/',
    icon: Home,
  },
  {
    kind: 'item',
    id: 'main.discover.search',
    order: 200,
    section: 'main.discover',
    title: 'Search',
    url: '/search',
    icon: Search,
  },
  { kind: 'section', id: 'main.app', order: 200, context: 'main', title: 'App' },
  {
    kind: 'item',
    id: 'main.app.settings',
    order: 100,
    section: 'main.app',
    title: 'Settings',
    url: '/settings/profile',
    icon: Settings,
  },
  {
    kind: 'section',
    id: 'main.support',
    order: 400,
    context: 'main',
    title: 'Support',
    secondary: true,
  },
  {
    kind: 'item',
    id: 'main.support.help',
    order: 100,
    section: 'main.support',
    title: 'Help & Support',
    url: '/support',
    icon: UserCog2Icon,
  },
];

const userMenuRecords: UserMenuRecord[] = [
  {
    id: 'account',
    order: 200,
    title: 'Account',
    to: '/settings/account',
    icon: User,
    guard: (user) => Boolean(user),
  },
  {
    id: 'sign-in',
    order: 250,
    title: 'Sign In',
    to: '/auth/login',
    icon: LogIn,
    guard: (user) => !user,
  },
  { id: 'settings', order: 300, title: 'Settings', to: '/settings', icon: Settings },
];

/**
 * Auth's sidebar and account-menu entries. Other modules register theirs the
 * same way, including sections inside these contexts.
 */
export default defineNuxtPlugin(() => {
  for (const record of sidebarRecords) {
    registerNavItem('sidebar', record);
  }

  for (const record of userMenuRecords) {
    registerNavItem('userMenu', record);
  }
});
