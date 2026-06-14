import { z } from 'zod'
import { totpCodeSchema } from './common'

export const setupTotpSchema = z.object({
  password: z.string().min(1, 'Password is required to set up 2FA'),
})

export const setupTotpFormSchema = z.object({
  password: z.string().min(1, 'Password is required'),
})

export const disableTotpSchema = z.object({
  password: z.string().min(1, 'Password is required to disable 2FA'),
})

export const verifyTotpSchema = z.object({
  code: totpCodeSchema('Authenticator code must be 6 digits'),
})

export const loginTwoFactorSchema = z.object({
  code: z.string()
    .trim()
    .min(6, 'Code must be at least 6 characters')
    .max(8, 'Code must be at most 8 characters')
    .regex(/^[a-zA-Z0-9]+$/, 'Code can only contain letters and numbers')
    .transform(value => value.toUpperCase()),
})

export const twoFactorVerifyFormSchema = z.object({
  verificationCode: totpCodeSchema('Verification code must be 6 digits'),
})

export const deletePasskeySchema = z.object({
  credentialId: z.string(),
})

export const webauthnRegisterUserSchema = z.object({
  userName: z.string().min(1).toLowerCase().trim(),
  displayName: z.string().min(1).trim(),
})

export const webauthnAddPasskeyUserSchema = z.object({
  userName: z.string().min(1).toLowerCase().trim(),
  displayName: z.string().min(1).trim().optional(),
})

export type SetupTotpInput = z.infer<typeof setupTotpSchema>
export type SetupTotpFormInput = z.infer<typeof setupTotpFormSchema>
export type DisableTotpInput = z.infer<typeof disableTotpSchema>
export type VerifyTotpInput = z.infer<typeof verifyTotpSchema>
export type LoginTwoFactorInput = z.infer<typeof loginTwoFactorSchema>
export type TwoFactorVerifyFormInput = z.infer<typeof twoFactorVerifyFormSchema>
export type DeletePasskeyInput = z.infer<typeof deletePasskeySchema>
export type WebauthnRegisterUserInput = z.infer<typeof webauthnRegisterUserSchema>
export type WebauthnAddPasskeyUserInput = z.infer<typeof webauthnAddPasskeyUserSchema>
