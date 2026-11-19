import '#layers/auth/types/extensions';
import { LogIn } from '@lucide/vue';
import DashboardSignIn from '#layers/auth/app/components/nav/DashboardSignIn.vue';
import NavUser from '#layers/auth/app/components/nav/NavUser.vue';
import SidebarAuthActions from '#layers/auth/app/components/nav/SidebarAuthActions.vue';
import { authRoutes } from '#layers/auth/shared/authRoutes';

export default defineNuxtPlugin(() => {
  registerNavGuardContext('user', () => useUserSession().user);

  registerNavItem('userMenu', {
    id: 'sign-in',
    order: 250,
    title: 'Sign In',
    to: authRoutes.AUTH_LOGIN,
    icon: LogIn,
    guard: ({ user }) => !user,
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
