import type { UpdateProfileInput } from '#layers/auth/shared/schemas/userSchema';

export interface LinkedAccount {
  provider: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  linkedAt: Date;
}

export interface UserProfileModel {
  id: number;
  username: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  lastLoginAt: Date;
  hasPassword: boolean;
  isAdmin: boolean;
  linkedAccounts: LinkedAccount[];
}

export type ProfileUpdateData = Pick<
  UserProfileModel,
  'id' | 'username' | keyof UpdateProfileInput
>;
