import { z } from 'zod';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { emailFieldSchema, requiredStringSchema } from '#shared/schemas/common';
import { users } from '../../server/db/schema.sqlite';

export const userIdSchema = z.coerce.number().int().positive('validation.user_id_required');

/**
 * Username validation schema
 */
export const usernameSchema = z
  .string()
  .min(3, 'validation.username_min')
  .max(50, 'validation.username_max')
  .regex(/^[a-z0-9_-]+$/, 'validation.username_format');

/**
 * Email validation schema
 */
export const emailSchema = emailFieldSchema();

/**
 * Base user creation schema derived from database.
 */
export const createUserSchema = createInsertSchema(users, {
  username: usernameSchema,
  email: emailSchema,
  name: requiredStringSchema('validation.name_required'),
  emailVerified: z.boolean().default(false),
  lastLoginAt: z.date().optional(),
  isAdmin: z.boolean().default(false),
});

/**
 * Schema for updating a user (all fields optional except id).
 */
export const userUpdateSchema = createUpdateSchema(users, {
  id: userIdSchema,
  username: usernameSchema.optional(),
  email: emailSchema.optional(),
  name: requiredStringSchema('validation.name_required').optional(),
  emailVerified: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  isLocked: z.boolean().optional(),
});

/**
 * Select schema for type inference from database queries.
 */
export const userSelectSchema = createSelectSchema(users);

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'validation.name_required'),
  email: emailSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type UserSelect = z.infer<typeof userSelectSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
