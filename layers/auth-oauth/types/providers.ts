import type { H3Error, H3Event } from 'h3';
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

export interface OAuthHandlerCallbacks<Result> {
  onSuccess: (event: H3Event, result: Result) => void | Promise<void>;
  onError: (event: H3Event, error: Pick<H3Error, 'statusMessage'>) => void | Promise<void>;
}

export interface OAuthProvider<Id extends OAuthProviderId> {
  id: Id;
  credentialsSchema: ZodType;
  createHandler: (callbacks: OAuthHandlerCallbacks<OAuthProfile>) => (event: H3Event) => unknown;
}

export interface OAuthProviderDefinition<Id extends OAuthProviderId, Result> {
  id: Id;
  credentialsSchema?: ZodType;
  createHandler: (callbacks: OAuthHandlerCallbacks<Result>) => (event: H3Event) => unknown;
  toAccount: (result: Result) => Record<keyof OAuthProfile, unknown>;
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
