import { z } from 'zod';

export const resendVerificationSchema = z.object({
  email: z.email(),
});
