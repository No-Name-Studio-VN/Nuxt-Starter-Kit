import '#layers/auth/types/extensions';
import { LogIn, Settings, Shield, User } from '@lucide/vue';
import DashboardSignIn from '#layers/auth/app/components/nav/DashboardSignIn.vue';
import HeaderAccountMenu from '#layers/auth/app/components/nav/HeaderAccountMenu.vue';
import NavUser from '#layers/auth/app/components/nav/NavUser.vue';
import SidebarAuthActions from '#layers/auth/app/components/nav/SidebarAuthActions.vue';
import type { NavGuard } from '~~/types/extensions';
import type { SidebarNavRecord } from '~~/types/sidebar';
import { authRoutes } from '#layers/auth/shared/authRoutes';

const signedIn: NavGuard = ({ user }) => Boolean(user);

const settingsRecords: SidebarNavRecord[] = [
  {
    kind: 'context',
    id: 'settings',
    order: 100,
    match: '/settings',
    variant: 'inset',
    showBack: true,
    guard: signedIn,
  },
  {
    kind: 'section',
    id: 'settings.account',
    order: 100,
    context: 'settings',
    title: 'account_page.account',
  },
  {
    kind: 'item',
    id: 'settings.account.profile',
    order: 100,
    section: 'settings.account',
    title: 'account_page.breadcrumb',
    titleKey: 'account_page.breadcrumb',
    url: authRoutes.SETTINGS_PROFILE,
    icon: User,
  },
  {
    kind: 'item',
    id: 'settings.account.security',
    order: 200,
    section: 'settings.account',
    title: 'settings.security_breadcrumb',
    titleKey: 'settings.security_breadcrumb',
    url: authRoutes.SETTINGS_SECURITY,
    icon: Shield,
  },
  {
    kind: 'section',
    id: 'main.auth',
    order: 300,
    context: 'main',
    title: 'account_page.account',
    guard: signedIn,
  },
  {
    kind: 'item',
    id: 'main.auth.settings',
    order: 100,
    section: 'main.auth',
    title: 'settings.breadcrumb',
    titleKey: 'settings.breadcrumb',
    url: authRoutes.SETTINGS_PROFILE,
    icon: Settings,
  },
];

export default defineNuxtPlugin(() => {
  registerNavGuardContext('user', () => useUserSession().user);

  for (const record of settingsRecords) registerNavItem('sidebar', record);

  registerNavItem('userMenu', {
    id: 'profile',
    order: 100,
    title: 'account_page.breadcrumb',
    titleKey: 'account_page.breadcrumb',
    to: authRoutes.SETTINGS_PROFILE,
    icon: User,
    guard: signedIn,
  });
  registerNavItem('userMenu', {
    id: 'settings',
    order: 300,
    title: 'settings.breadcrumb',
    titleKey: 'settings.breadcrumb',
    to: '/settings',
    icon: Settings,
    guard: signedIn,
  });
  registerNavItem('userMenu', {
    id: 'sign-in',
    order: 250,
    title: 'common.sign_in',
    titleKey: 'common.sign_in',
    to: authRoutes.AUTH_LOGIN,
    icon: LogIn,
    guard: ({ user }) => !user,
  });

  registerExtension('header:actions', {
    id: 'auth-account',
    order: 100,
    component: HeaderAccountMenu,
  });
  registerExtension('sidebar:user', { id: 'auth-user', order: 100, component: NavUser });
  registerExtension('sidebar:footer', {
    id: 'auth-actions',
    order: 200,
    component: SidebarAuthActions,
  });
  registerExtension('dashboard:header:actions', {
    id: 'auth-sign-in',
    order: 100,
    component: DashboardSignIn,
  });
});
