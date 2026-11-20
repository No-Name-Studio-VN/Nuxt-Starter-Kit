import type { tables } from '#layers/database/server/utils/db';

export type User = typeof tables.users.$inferSelect;
export type SafeUser = Pick<
  User,
  | 'id'
  | 'username'
  | 'name'
  | 'email'
  | 'emailVerified'
  | 'isAdmin'
  | 'isLocked'
  | 'lastLoginAt'
  | 'createdAt'
  | 'updatedAt'
>;
export type DBLockScreen = typeof tables.userLockScreen.$inferSelect;
export interface SessionUser {
  id: number;
  username: string;
  name: string;
  isAdmin: boolean;
  onboardingPending: boolean;
  avatarUrl?: string;
  skipLockOnInit?: boolean;
}

export type AuthErrorCode = 'validation' | 'unknown' | 'account-locked' | 'sign-in-step-required';

export type AuthErrorMessage = string | { key: string; fallback: string };

export interface AuthMessages {
  errors: Record<string, AuthErrorMessage>;
  success: Record<string, string>;
}
