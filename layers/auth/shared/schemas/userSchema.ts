import { z } from 'zod';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { emailFieldSchema, requiredStringSchema } from '#shared/schemas/common';
import { users } from '../../server/db/schema.sqlite';

export const userIdSchema = z.coerce.number().int().positive('validation.user_id_required');

/**
 * Enhanced password complexity validation
 * Requires: min 8 chars, lowercase, uppercase, number, and special character
 */
export const passwordComplexitySchema = z
  .string()
  .min(8, 'validation.password_min')
  .regex(/[a-z]/, 'validation.password_lowercase')
  .regex(/[A-Z]/, 'validation.password_uppercase')
  .regex(/\d/, 'validation.password_number')
  .regex(/[^a-z0-9]/i, 'validation.password_special');

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
 * Schema for user registration (frontend form).
 * Includes Turnstile token validation.
 *
 * @example
 * ```ts
 * // In API routes:
 * import { registerUserSchema, passwordComplexitySchema } from '#layers/auth/shared/schemas/userSchema'
 *
 * const result = registerUserSchema.safeParse(formData)
 * if (!result.success) {
 *   console.error(result.error.issues)
 * }
 * ```
 */
export const registerUserSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    name: requiredStringSchema('validation.name_required'),
    password: passwordComplexitySchema,
    'confirm-password': z.string().min(1, 'validation.password_confirm_required'),
    'cf-turnstile-response': z.string().min(1, 'validation.token_required'),
    'redirect-to': z.string().optional(),
  })
  .refine((data) => data['confirm-password'] === data.password, {
    error: 'validation.passwords_mismatch',
    path: ['confirm-password'],
  });

/**
 * Base user creation schema derived from database.
 */
export const createUserSchema = createInsertSchema(users, {
  username: usernameSchema,
  email: emailSchema,
  name: requiredStringSchema('validation.name_required'),
  password: requiredStringSchema('validation.password_hash_required'),
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
  password: z.string().min(1, 'validation.password_required').optional(),
  emailVerified: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  isLocked: z.boolean().optional(),
});

/**
 * Select schema for type inference from database queries.
 */
export const userSelectSchema = createSelectSchema(users);

/**
 * Schema for changing password (shared between frontend form and API route).
 * Validates current password, new password complexity, and confirmation match.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'validation.current_password_required'),
    newPassword: passwordComplexitySchema,
    confirmPassword: z.string().min(1, 'validation.new_password_confirm_required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: 'validation.passwords_mismatch',
    path: ['confirmPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'validation.name_required'),
  email: emailSchema,
});

export const loginSchema = z.object({
  username: z.string().min(1, 'validation.username_required'),
  password: z.string().min(1, 'validation.password_required'),
  'cf-turnstile-response': z.string(),
  'redirect-to': z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
  'cf-turnstile-response': z.string().min(1),
});

export const forgotPasswordFormSchema = z.object({
  email: z.email('Please enter a valid email address'),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordComplexitySchema,
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const resetPasswordFormSchema = z
  .object({
    password: passwordComplexitySchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const googleOneTapBodySchema = z.object({
  credential: z.string().trim().min(1),
});

export const oauthUrlBodySchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  action: z.enum(['login', 'link']).optional(),
  redirectTo: z.string().optional(),
});

export const oauthUnlinkBodySchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type UserSelect = z.infer<typeof userSelectSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ForgotPasswordFormInput = z.infer<typeof forgotPasswordFormSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;
export type GoogleOneTapBodyInput = z.infer<typeof googleOneTapBodySchema>;
export type OAuthUrlBodyInput = z.infer<typeof oauthUrlBodySchema>;
export type OAuthUnlinkBodyInput = z.infer<typeof oauthUnlinkBodySchema>;
