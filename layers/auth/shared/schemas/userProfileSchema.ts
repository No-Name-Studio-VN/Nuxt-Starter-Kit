import { z } from 'zod';
import { userSelectSchema } from './userSchema';

export const linkedAccountSchema = z.object({
  provider: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  linkedAt: z.date(),
});

export const userProfileSchema = userSelectSchema.pick({
  id: true,
  username: true,
  name: true,
  email: true,
  emailVerified: true,
  isAdmin: true,
  passwordChangedAt: true,
}).extend({
  createdAt: z.date(),
  lastLoginAt: z.date(),
  hasPassword: z.boolean(),
  contributedSignInMethodCount: z.number().int().nonnegative(),
  linkedAccounts: z.array(linkedAccountSchema),
});
