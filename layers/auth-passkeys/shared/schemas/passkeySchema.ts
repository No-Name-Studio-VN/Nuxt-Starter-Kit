import { z } from 'zod';

export const deletePasskeySchema = z.object({
  credentialId: z.string(),
});

export const webauthnRegisterUserSchema = z.object({
  userName: z.string().min(1).toLowerCase().trim(),
  displayName: z.string().min(1).trim(),
});

export const webauthnAddPasskeyUserSchema = z.object({
  userName: z.string().min(1).toLowerCase().trim(),
  displayName: z.string().min(1).trim().optional(),
});

export type DeletePasskeyInput = z.infer<typeof deletePasskeySchema>;
export type WebauthnRegisterUserInput = z.infer<typeof webauthnRegisterUserSchema>;
export type WebauthnAddPasskeyUserInput = z.infer<typeof webauthnAddPasskeyUserSchema>;
