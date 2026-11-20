import { z } from 'zod';
import { emailFieldSchema } from '#shared/schemas/common';
import { emailSchema, signInUsernameSchema, userNameSchema, usernameSchema } from '#layers/auth/shared/schemas/userSchema';

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
 * Schema for user registration (frontend form).
 * Includes Turnstile token validation.
 *
 * @example
 * ```ts
 * // In API routes:
 * import { registerUserSchema } from '#layers/auth-password/shared/schemas/passwordSchema'
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
    name: userNameSchema,
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
 * Schema for changing password (shared between frontend form and API route).
 * Validates current password, new password complexity, and confirmation match.
 */
export const setPasswordSchema = z
  .object({
    newPassword: passwordComplexitySchema,
    confirmPassword: z.string().min(1, 'validation.new_password_confirm_required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: 'validation.passwords_mismatch',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = setPasswordSchema.safeExtend({
  currentPassword: z.string().min(1, 'validation.current_password_required'),
});

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const loginSchema = z.object({
  username: signInUsernameSchema,
  password: z.string().min(1, 'validation.password_required'),
  'cf-turnstile-response': z.string(),
  'redirect-to': z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailFieldSchema(),
  'cf-turnstile-response': z.string().min(1),
});

export const forgotPasswordFormSchema = z.object({
  email: emailFieldSchema('Please enter a valid email address'),
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

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ForgotPasswordFormInput = z.infer<typeof forgotPasswordFormSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;
