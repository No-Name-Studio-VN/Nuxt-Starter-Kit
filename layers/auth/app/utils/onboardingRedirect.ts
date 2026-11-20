import { authRoutes } from '../../shared/authRoutes';
import { defaultLocale, locales } from '../../../../i18n-constants';

function findLocalePrefix(path: string) {
  return locales.find((locale) => path === `/${locale}` || path.startsWith(`/${locale}/`));
}

export function getOnboardingRouteLocale(path: string) {
  return findLocalePrefix(path) ?? defaultLocale;
}

export function resolveOnboardingRedirect(
  path: string,
  routeBaseName: string | undefined,
  pending: boolean,
): string | null {
  const prefix = findLocalePrefix(path);
  const localPath = (prefix ? path.slice(prefix.length + 1) : path).replace(/\/+$/, '');
  const isOnboarding = routeBaseName === 'onboarding' || localPath === authRoutes.ONBOARDING;

  if (!pending) {
    return isOnboarding ? '/' : null;
  }

  const isAuthRoute = localPath === '/auth' || localPath.startsWith('/auth/');
  return isOnboarding || isAuthRoute ? null : authRoutes.ONBOARDING;
}
