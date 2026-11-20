import type { SessionUser } from '#layers/auth/types/auth';
import type { SignInMethod } from '#layers/auth/types/lastSignIn';

declare module '#auth-utils' {
  interface User {
    id: SessionUser['id'];
    username: SessionUser['username'];
    name: SessionUser['name'];
    avatarUrl?: SessionUser['avatarUrl'];
    isAdmin: SessionUser['isAdmin'];
    onboardingPending: SessionUser['onboardingPending'];
    /** Set on a fresh sign-in so the lock screen does not challenge immediately. */
    skipLockOnInit?: boolean;
  }

  interface UserSession {
    loggedInAt?: Date;
    loginMethod?: SignInMethod;
    loginProvider?: string;
    loginMethodAt?: number;
  }
}

/**
 * Type for the authenticated user from session
 * Use this when accessing session.user to get proper typing
 */
export type { SessionUser } from '#layers/auth/types/auth';
