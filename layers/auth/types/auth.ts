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
export type DBAuthToken = typeof tables.authTokens.$inferSelect;
export interface SessionUser {
  id: number;
  username: string;
  name: string;
  isAdmin: boolean;
  skipLockOnInit?: boolean;
}

export type AuthErrorCode =
  | 'validation'
  | 'captcha'
  | 'existed'
  | 'email-existed'
  | 'unknown'
  | 'invalid-credentials'
  | 'reset-invalid-token'
  | 'reset-token-expired';

export type AuthSuccessCode = 'password-reset' | 'reset-link-sent';

export interface AuthMessages {
  errors: Record<string, string>;
  success: Record<string, string>;
}
