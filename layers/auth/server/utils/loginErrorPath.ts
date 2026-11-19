import type { ApiErrorOptions } from '#layers/server-core/types/api';
import { authRoutes } from '#layers/auth/shared/authRoutes';

/** The login page's `?error=` slug for a denied sign-in, e.g. ACCOUNT_LOCKED -> account-locked. */
export function loginErrorPath(error: ApiErrorOptions, fallback: string): string {
  const slug = error.code ? error.code.toLowerCase().replace(/_/g, '-') : fallback;
  return `${authRoutes.AUTH_LOGIN}?error=${encodeURIComponent(slug)}`;
}
