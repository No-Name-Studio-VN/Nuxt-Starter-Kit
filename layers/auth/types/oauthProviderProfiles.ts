import type { z } from 'zod';
import type { githubEmailSchema } from '#layers/auth/shared/schemas/oauthProviderSchema';

export interface GoogleOAuthUser {
  sub: string;
  email?: string | null;
  email_verified?: boolean;
  hd?: string;
  name?: string;
  picture?: string;
}

type GitHubUser = Parameters<Parameters<typeof defineOAuthGitHubEventHandler>[0]['onSuccess']>[1]['user'];

export type GitHubOAuthUser = Pick<GitHubUser, 'id' | 'login'> & {
  email?: GitHubUser['email'];
  name?: string | null;
  avatar_url?: string;
};

export type GitHubPrimaryEmail = Pick<z.infer<typeof githubEmailSchema>, 'email' | 'verified'>;

export interface DiscordOAuthUser {
  id: string;
  username: string;
  global_name?: string | null;
  email?: string | null;
  verified?: boolean;
  avatar?: string | null;
}
