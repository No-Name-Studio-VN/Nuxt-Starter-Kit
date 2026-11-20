import { z } from 'zod';
import { userSelectSchema } from './userSchema';

export const userProfileSchema = userSelectSchema.pick({
  id: true,
  username: true,
  name: true,
  email: true,
  emailVerified: true,
  isAdmin: true,
}).extend({
  createdAt: z.union([z.date(), z.iso.datetime()]),
  lastLoginAt: z.union([z.date(), z.iso.datetime()]),
  signInMethods: z.record(z.string(), z.number().int().nonnegative()),
  passwordChangedAt: z.union([z.date(), z.iso.datetime()]).nullable().optional(),
});
