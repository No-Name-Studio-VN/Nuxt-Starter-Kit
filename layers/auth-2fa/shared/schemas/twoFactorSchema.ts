import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { commonSchemaFragments } from '#shared/schemas/common';
import { userIdSchema } from '#layers/auth/shared/schemas/userSchema';
import { userTwoFactor } from '../../server/db/schema.sqlite';
import { TOTP_LENGTH } from '../constants/totp';

export const createUserTwoFactorSchema = createInsertSchema(userTwoFactor, {
  userId: userIdSchema,
  ...commonSchemaFragments.coerceDates,
});
export type UserTwoFactorCreateInput = z.infer<typeof createUserTwoFactorSchema>;

export const updateUserTwoFactorSchema = createUpdateSchema(userTwoFactor, {
  userId: userIdSchema,
  ...commonSchemaFragments.coerceDates,
});
export type UserTwoFactorUpdateInput = z.infer<typeof updateUserTwoFactorSchema>;

export function totpCodeSchema(error = `Authenticator code must be ${TOTP_LENGTH} digits`) {
  return z.string().length(TOTP_LENGTH, error);
}

export const setupTotpSchema = z.object({
  password: z.string().min(1, 'Password is required to setup 2FA'),
});

export const setupTotpFormSchema = z.object({
  password: z.string().min(1, 'validation.password_required'),
});

export const disableTotpSchema = z.object({
  password: z.string().min(1, 'Password is required to disable 2FA'),
});

export const verifyTotpSchema = z.object({
  code: totpCodeSchema('Authenticator code must be 6 digits'),
});

export const validateTotpSchema = verifyTotpSchema;

export const loginTwoFactorSchema = z.object({
  code: totpCodeSchema('Code must be 6 digits'),
});

export const twoFactorVerifyFormSchema = z.object({
  verificationCode: totpCodeSchema('Verification code must be 6 digits'),
});

export type SetupTotpInput = z.infer<typeof setupTotpSchema>;
export type SetupTotpFormInput = z.infer<typeof setupTotpFormSchema>;
export type DisableTotpInput = z.infer<typeof disableTotpSchema>;
export type VerifyTotpInput = z.infer<typeof verifyTotpSchema>;
export type ValidateTotpInput = z.infer<typeof validateTotpSchema>;
export type LoginTwoFactorInput = z.infer<typeof loginTwoFactorSchema>;
export type TwoFactorVerifyFormInput = z.infer<typeof twoFactorVerifyFormSchema>;
