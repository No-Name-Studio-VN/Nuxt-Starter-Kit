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
  skipLockOnInit?: boolean;
}

export type AuthErrorCode = 'validation' | 'unknown';

export interface AuthMessages {
  errors: Record<string, string>;
  success: Record<string, string>;
}
