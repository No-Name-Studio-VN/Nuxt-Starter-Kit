import type { z } from 'zod';
import type { linkedAccountSchema, userProfileSchema } from '#layers/auth/shared/schemas/userProfileSchema';

export type LinkedAccount = z.infer<typeof linkedAccountSchema>;
export type UserProfileModel = z.infer<typeof userProfileSchema>;

export type ProfileUpdateData = Pick<UserProfileModel, 'id' | 'username' | 'name' | 'email'>;

export type UsernameAvailabilityData = { available: boolean };
