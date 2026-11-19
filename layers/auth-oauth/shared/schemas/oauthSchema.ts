import { z } from 'zod';

export const googleOneTapBodySchema = z.object({
  credential: z.string().trim().min(1),
});

export const oauthUrlBodySchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  action: z.enum(['login', 'link']).optional(),
  redirectTo: z.string().optional(),
});

export const oauthUnlinkBodySchema = oauthUrlBodySchema.pick({ provider: true });

export const oauthProviderListSchema = z.array(z.string());
export const oauthRuntimeCredentialsSchema = z.record(z.string(), z.unknown());

const requiredString = z.string().trim().min(1);

export const oauthCredentialsSchema = z.object({
  clientId: requiredString,
  clientSecret: requiredString,
});

export const oidcCredentialsSchema = oauthCredentialsSchema.extend({
  openidConfig: z.union([
    requiredString,
    z.object({ authorization_endpoint: requiredString, token_endpoint: requiredString }),
  ]),
});

export const oauthProfileSchema = z.object({
  providerAccountId: requiredString,
  email: z.email(),
  name: z.string(),
  avatarUrl: z.string().nullish(),
});
