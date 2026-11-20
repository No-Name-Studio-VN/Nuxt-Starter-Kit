import { z } from 'zod';

export const githubEmailSchema = z.object({
  email: z.string(),
  primary: z.boolean(),
  verified: z.boolean(),
});

export const githubEmailsSchema = z.array(githubEmailSchema);
