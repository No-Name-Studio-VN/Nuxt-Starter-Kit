import type { z } from 'zod';
import type { resendVerificationSchema } from '../shared/schemas/emailVerificationSchema';

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export type EmailVerificationErrorCode =
  | 'email-not-verified'
  | 'invalid-token'
  | 'token-expired'
  | 'resend-too-soon';

export type EmailVerificationSuccessCode = 'email-verified' | 'verification-sent';
