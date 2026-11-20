import { emailFieldSchema } from '#shared/schemas/common';
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
  email: emailFieldSchema().optional(),
  emailVerified: z.boolean(),
  emailAuthoritative: z.boolean(),
  name: z.string(),
  avatarUrl: z.string().nullish(),
});

export const githubEmailsSchema = z.array(z.object({
  email: emailFieldSchema(),
  primary: z.boolean(),
  verified: z.boolean(),
}));

export const linkedAccountSchema = z.object({
  provider: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  linkedAt: z.union([z.date(), z.iso.datetime()]).nullable(),
});
