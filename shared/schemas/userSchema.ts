import { z } from 'zod'
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod'
import { users } from '~~/server/db/schema.sqlite'
import { commonSchemaFragments, emailFieldSchema, requiredStringSchema } from './common'

/**
 * Enhanced password complexity validation.
 * Requires: min 8 chars, lowercase, uppercase, number, and special character.
 */
export const passwordComplexitySchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')

/**
 * Username validation schema.
 */
export const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username too long')
  .regex(/^[a-z0-9_-]+$/, 'Username can only contain lowercase letters, numbers, hyphens, and underscores')

/**
 * Email validation schema.
 */
export const emailSchema = emailFieldSchema()

/**
 * Schema for user registration (frontend form).
 * Includes Turnstile token validation.
 */
export const registerUserSchema = z.object({
  'username': usernameSchema,
  'email': emailSchema,
  'name': requiredStringSchema('Name is required'),
  'password': passwordComplexitySchema,
  'confirm-password': z.string().min(1, 'Please confirm your password'),
  'cf-turnstile-response': z.string().min(1, 'Validation token is required'),
  'redirect-to': z.string().optional(),
}).refine(data => data['confirm-password'] === data.password, {
  error: 'Passwords do not match',
  path: ['confirm-password'],
})

/**
 * Base user creation schema derived from database.
 */
export const createUserSchema = createInsertSchema(users, {
  username: usernameSchema,
  email: emailSchema,
  name: requiredStringSchema('Name is required'),
  password: requiredStringSchema('Password hash is required'),
  emailVerified: z.boolean().default(true),
  lastLoginAt: z.date().optional(),
  isAdmin: z.boolean().default(false),
})

/**
 * Schema for updating a user.
 */
export const userUpdateSchema = createUpdateSchema(users, {
  id: commonSchemaFragments.userId,
  username: usernameSchema.optional(),
  email: emailSchema.optional(),
  name: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  emailVerified: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
})

export const adminUserCreateFormSchema = createUserSchema.pick({
  username: true,
  email: true,
  name: true,
  password: true,
  isAdmin: true,
})

export const adminUserEditFormSchema = userUpdateSchema.pick({
  id: true,
  username: true,
  email: true,
  name: true,
  password: true,
  isAdmin: true,
}).extend({
  password: z.string().optional().default(''),
})

/**
 * Select schema for type inference from database queries.
 */
export const userSelectSchema = createSelectSchema(users)

/**
 * Schema for changing password.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordComplexitySchema,
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine(data => data.newPassword === data.confirmPassword, {
  error: 'Passwords do not match',
  path: ['confirmPassword'],
})

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: emailSchema,
})

export const loginSchema = z.object({
  'username': z.string().min(1, 'Username is required'),
  'password': z.string().min(1, 'Password is required'),
  'cf-turnstile-response': z.string(),
  'redirect-to': z.string().optional(),
})

export const forgotPasswordSchema = z.object({
  'email': emailSchema,
  'cf-turnstile-response': z.string().min(1, 'Validation token is required'),
})

export const forgotPasswordFormSchema = z.object({
  email: emailSchema,
})

export const resendVerificationSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordComplexitySchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(data => data.password === data.confirmPassword, {
  error: 'Passwords do not match',
  path: ['confirmPassword'],
})

export const resetPasswordFormSchema = z.object({
  password: passwordComplexitySchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(data => data.password === data.confirmPassword, {
  error: 'Passwords do not match',
  path: ['confirmPassword'],
})

export const oauthUrlBodySchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  action: z.enum(['login', 'link']).optional(),
  redirectTo: z.string().optional(),
})

export const oauthUnlinkBodySchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type RegisterUserInput = z.infer<typeof registerUserSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type AdminUserCreateFormInput = z.infer<typeof adminUserCreateFormSchema>
export type AdminUserEditFormInput = z.infer<typeof adminUserEditFormSchema>
export type UserUpdateInput = z.infer<typeof userUpdateSchema>
export type UserSelect = z.infer<typeof userSelectSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ForgotPasswordFormInput = z.infer<typeof forgotPasswordFormSchema>
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>
export type OAuthUrlBodyInput = z.infer<typeof oauthUrlBodySchema>
export type OAuthUnlinkBodyInput = z.infer<typeof oauthUnlinkBodySchema>
