import { z } from 'zod';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { emailFieldSchema, requiredStringSchema } from '#shared/schemas/common';
import { users } from '../../server/db/schema.sqlite';

export const userIdSchema = z.coerce.number().int().positive('validation.user_id_required');

/**
 * Username validation schema
 */
export const signInUsernameSchema = z.string().trim().toLowerCase().min(1, 'validation.username_required');

export const MAX_USER_NAME_LENGTH = 256;
export const MAX_USERNAME_LENGTH = 50;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'validation.username_min')
  .max(MAX_USERNAME_LENGTH, 'validation.username_max')
  .regex(/^[a-z0-9_-]+$/, 'validation.username_format');

export const updateUsernameSchema = z.object({ username: usernameSchema });

export const userNameSchema = requiredStringSchema('validation.name_required')
  .max(MAX_USER_NAME_LENGTH, 'validation.name_max');

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
  name: userNameSchema,
  emailVerified: z.boolean().default(false),
  lastLoginAt: z.date().optional(),
  isAdmin: z.boolean().default(false),
}).omit({ onboardingPending: true, onboardingCompletedSteps: true });

/**
 * Schema for updating a user (all fields optional except id).
 */
export const userUpdateSchema = createUpdateSchema(users, {
  id: userIdSchema,
  username: usernameSchema.optional(),
  email: emailSchema.optional(),
  name: userNameSchema.optional(),
  emailVerified: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  isLocked: z.boolean().optional(),
}).omit({ onboardingPending: true, onboardingCompletedSteps: true });

/**
 * Select schema for type inference from database queries.
 */
export const userSelectSchema = createSelectSchema(users);

export const updateProfileSchema = z.object({
  name: z.string().trim().pipe(userNameSchema),
  email: emailSchema,
  currentPassword: z.string().optional(),
});

export const settingsProfileSchema = updateProfileSchema.extend(updateUsernameSchema.shape);

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type UserSelect = z.infer<typeof userSelectSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
