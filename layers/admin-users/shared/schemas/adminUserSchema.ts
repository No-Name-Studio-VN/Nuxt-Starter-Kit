import { z } from 'zod';
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

export const adminUserCreateFormSchema = createUserSchema.pick({
  username: true,
  email: true,
  name: true,
  password: true,
  isAdmin: true,
});

export const adminUserEditFormSchema = userUpdateSchema
  .pick({
    id: true,
    username: true,
    email: true,
    name: true,
    password: true,
    emailVerified: true,
    isAdmin: true,
  })
  .extend({
    password: z.string().optional().default(''),
  });

export type AdminUserCreateFormInput = z.infer<typeof adminUserCreateFormSchema>;
export type AdminUserEditFormInput = z.infer<typeof adminUserEditFormSchema>;
