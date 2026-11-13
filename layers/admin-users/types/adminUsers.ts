import type { SafeUser } from '#layers/auth/types/auth';

export type AdminUserModel = Pick<
  SafeUser,
  'id' | 'username' | 'name' | 'email' | 'isAdmin' | 'isLocked' | 'emailVerified'
>;
