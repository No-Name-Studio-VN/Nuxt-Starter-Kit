import type { SafeUser } from '#layers/auth/types/auth';
import type { UpdateProfileInput } from '#layers/auth/shared/schemas/userSchema';

export interface LinkedAccount {
  provider: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  linkedAt: Date;
}

export interface UserProfileModel extends Pick<
  SafeUser,
  'id' | 'username' | 'name' | 'email' | 'emailVerified' | 'isAdmin'
> {
  createdAt: Date;
  lastLoginAt: Date;
  hasPassword: boolean;
  linkedAccounts: LinkedAccount[];
}

export type ProfileUpdateData = Pick<
  UserProfileModel,
  'id' | 'username' | keyof UpdateProfileInput
>;
