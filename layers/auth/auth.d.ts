import type { SessionUser } from '#layers/auth/types/auth';
import type { SignInEvidence } from '#layers/auth/types/signInMethods';

declare module '#auth-utils' {
  interface User {
    id: SessionUser['id'];
    username: SessionUser['username'];
    name: SessionUser['name'];
    isAdmin: SessionUser['isAdmin'];
    onboardingPending: SessionUser['onboardingPending'];
    avatarUrl?: SessionUser['avatarUrl'];
    /** Set on a fresh sign-in so the lock screen does not challenge immediately. */
    skipLockOnInit?: boolean;
  }

  interface UserSession {
    loggedInAt?: Date;
    signedInAt?: number;
    loginMethod?: string;
    loginProvider?: string;
    loginMethodAt?: number;
  }
}

declare module 'nitropack/types' {
  interface NitroRuntimeHooks {
    /**
     * After every login policy allowed a sign-in, before its session is written.
     * Changes a handler makes to the user row reach the session.
     */
    'auth:signed-in': (evidence: SignInEvidence) => void | Promise<void>;
  }
}

/**
 * Type for the authenticated user from session
 * Use this when accessing session.user to get proper typing
 */
export type { SessionUser } from '#layers/auth/types/auth';
