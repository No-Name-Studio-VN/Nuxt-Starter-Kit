import type { SafeUser } from '#layers/auth/types/auth';
import type { UpdateProfileInput } from '#layers/auth/shared/schemas/userSchema';

export interface UserProfileModel extends Pick<
  SafeUser,
  'id' | 'username' | 'name' | 'email' | 'emailVerified' | 'isAdmin'
> {
  createdAt: Date;
  lastLoginAt: Date;
  /** How many ways in each registered sign-in method gives the user, keyed by method id. */
  signInMethods: Record<string, number>;
}

export type ProfileUpdateData = Pick<
  UserProfileModel,
  'id' | 'username' | keyof UpdateProfileInput
>;
