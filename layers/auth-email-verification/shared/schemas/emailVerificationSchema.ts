import { z } from 'zod';
import { emailFieldSchema } from '#shared/schemas/common';

export const resendVerificationSchema = z.object({
  email: emailFieldSchema(),
});
