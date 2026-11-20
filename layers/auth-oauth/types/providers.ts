import type { RequestEvent } from 'nuxt/server';
import type { ZodType, z } from 'zod';
import type { OAUTH_PROVIDERS } from '../shared/constants/oauthProviders';
import type { oauthProfileSchema } from '../shared/schemas/oauthSchema';

export type OAuthProviderId = keyof typeof OAUTH_PROVIDERS;
export type OAuthProviderIcon = 'google' | 'github' | 'discord' | 'key-round';

export interface OAuthProviderDisplay {
  label: string;
  icon: OAuthProviderIcon;
}
export type OAuthProfile = z.infer<typeof oauthProfileSchema>;

export interface OAuthHandlerError {
  statusMessage?: string;
}

export interface OAuthHandlerCallbacks<Result> {
  onSuccess: (event: RequestEvent, result: Result) => unknown;
  onError: (event: RequestEvent, error: OAuthHandlerError) => unknown;
}

export interface OAuthProvider<Id extends OAuthProviderId> {
  id: Id;
  credentialsSchema: ZodType;
  createHandler: (callbacks: OAuthHandlerCallbacks<OAuthProfile>) => (event: RequestEvent) => unknown;
}

export interface OAuthProviderDefinition<Id extends OAuthProviderId, Result> {
  id: Id;
  credentialsSchema?: ZodType;
  createHandler: (callbacks: OAuthHandlerCallbacks<Result>) => (event: RequestEvent) => unknown;
  toAccount: (result: Result) => Partial<Record<keyof OAuthProfile, unknown>> | Promise<Partial<Record<keyof OAuthProfile, unknown>>>;
}

export interface OAuthReadiness {
  ready: OAuthProviderId[];
  unknownProviders: string[];
  missingCredentials: OAuthProviderId[];
  invalidList: boolean;
}

export interface OAuthRuntimeConfig {
  public: { site?: { auth?: { oauth?: unknown } } };
  oauth?: unknown;
}
