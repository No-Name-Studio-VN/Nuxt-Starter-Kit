import type { SessionUser } from '~~/types/auth';

declare module '#auth-utils' {
  interface User {
    id: SessionUser['id'];
    username: SessionUser['username'];
    name: SessionUser['name'];
    isAdmin: SessionUser['isAdmin'];
  }

  interface UserSession {
    loggedInAt?: Date;
  }

  interface SecureSessionData {
    // <nsk:auth-2fa>
    pending2faUserId?: number;
    // </nsk:auth-2fa>
  }
}

/**
 * Type for the authenticated user from session
 * Use this when accessing session.user to get proper typing
 */
export type { SessionUser } from '~~/types/auth';
