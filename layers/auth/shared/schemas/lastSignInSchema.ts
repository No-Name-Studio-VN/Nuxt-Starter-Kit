import { z } from 'zod';

export const signInAvatarUrlSchema = z.url({ protocol: /^https?$/ }).max(1024);
const cachedAvatarSchema = z.string().max(32_768).regex(/^data:image\/(?:webp|png);base64,[a-z0-9+/]+=*$/i);
const avatarSchema = z.union([signInAvatarUrlSchema, cachedAvatarSchema]).nullable();
const providerIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);

const account = {
  username: z.string().trim().min(1),
  name: z.string().trim().min(1),
  avatar: avatarSchema,
  avatarUrl: signInAvatarUrlSchema.nullable(),
  savedAt: z.int().positive(),
};

export const lastSignInSchema = z.discriminatedUnion('method', [
  z.strictObject({ ...account, method: z.literal('password') }),
  z.strictObject({ ...account, method: z.literal('passkey') }),
  z.strictObject({ ...account, method: z.literal('oauth'), provider: providerIdSchema }),
]);
