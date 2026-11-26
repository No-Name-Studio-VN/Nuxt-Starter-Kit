import { z } from 'zod';
import { requiredStringSchema } from '#shared/schemas/common';
import { createUserSchema, userUpdateSchema } from '#layers/auth/shared/schemas/userSchema';

/**
 * Schema for the dedicated lock/unlock endpoint.
 */
export const adminUserLockSchema = z.object({
  isLocked: z.boolean(),
});
export type AdminUserLockInput = z.infer<typeof adminUserLockSchema>;

export const adminBulkUserDeleteSchema = z.object({
  userIds: z
    .array(z.number().int().positive().refine(Number.isSafeInteger))
    .min(1)
    .transform((userIds) => [...new Set(userIds)]),
});
export type AdminBulkUserDeleteInput = z.input<typeof adminBulkUserDeleteSchema>;

/**
 * Creating a user sets their password, so it exists only when password
 * sign-in is installed; without it an account would have no way in.
 */
export const adminUserCreateSchema = createUserSchema.extend({
  password: requiredStringSchema('admin.users.password_required'),
});

/** A blank or missing password keeps the current one. */
export const adminUserUpdateSchema = userUpdateSchema.extend({
  password: z.string().optional().default(''),
});

export const adminUserCreateFormSchema = adminUserCreateSchema.pick({
  username: true,
  email: true,
  name: true,
  password: true,
  isAdmin: true,
});

export const adminUserEditFormSchema = adminUserUpdateSchema.pick({
  id: true,
  username: true,
  email: true,
  name: true,
  password: true,
  emailVerified: true,
  isAdmin: true,
});

export type AdminUserCreateFormInput = z.infer<typeof adminUserCreateFormSchema>;
export type AdminUserEditFormInput = z.infer<typeof adminUserEditFormSchema>;
