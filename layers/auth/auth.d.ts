import type { SessionUser } from '#layers/auth/types/auth';

declare module '#auth-utils' {
  interface User {
    id: SessionUser['id'];
    username: SessionUser['username'];
    name: SessionUser['name'];
    isAdmin: SessionUser['isAdmin'];
    /** Set on a fresh sign-in so the lock screen does not challenge immediately. */
    skipLockOnInit?: boolean;
  }

  interface UserSession {
    loggedInAt?: Date;
  }
}

/**
 * Type for the authenticated user from session
 * Use this when accessing session.user to get proper typing
 */
export type { SessionUser } from '#layers/auth/types/auth';
