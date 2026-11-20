import type { RuntimeConfig } from 'nuxt/schema';
import type { OAuthProfile, OAuthProviderDefinition } from '#layers/auth/types/auth';
import type {
  DiscordOAuthUser,
  GitHubOAuthUser,
  GitHubPrimaryEmail,
  GoogleOAuthUser,
} from '#layers/auth/types/oauthProviderProfiles';
import { githubEmailsSchema } from '#layers/auth/shared/schemas/oauthProviderSchema';
import { oauthProviderInfo } from '#layers/auth/shared/constants/oauthProviders';

export function getEnabledOAuthProviders(config: RuntimeConfig): OAuthProviderDefinition[] {
  return oauthProviders.filter((provider) => provider.isEnabled(config));
}

export function getOAuthProvider(id: string, config: RuntimeConfig): OAuthProviderDefinition | undefined {
  const provider = oauthProviders.find((definition) => definition.id === id);
  if (provider?.isEnabled(config)) return provider;
}

export function googleProfile(user: GoogleOAuthUser): OAuthProfile {
  const email = user.email ?? '';
  const address = email.trim().toLowerCase();

  return {
    id: user.sub,
    email,
    name: user.name || email,
    ...(user.picture ? { avatarUrl: user.picture } : {}),
    emailVerified: address.length > 0 && user.email_verified === true,
    // Google can vouch for Gmail and Workspace addresses, but not third-party mailboxes.
    emailAuthoritative: address.length > 0 && (address.endsWith('@gmail.com') || Boolean(user.hd?.trim())),
  };
}

export function githubProfile(user: GitHubOAuthUser, primaryEmail?: GitHubPrimaryEmail | null): OAuthProfile {
  const email = primaryEmail?.email ?? '';
  const emailVerified = email.trim().length > 0 && primaryEmail?.verified === true;
  return {
    id: String(user.id),
    email,
    name: user.name || user.login,
    ...(user.avatar_url ? { avatarUrl: user.avatar_url } : {}),
    emailVerified,
    emailAuthoritative: emailVerified,
  };
}

export function discordProfile(user: DiscordOAuthUser): OAuthProfile {
  const email = user.email ?? '';
  const emailVerified = email.trim().length > 0 && user.verified === true;
  return {
    id: user.id,
    email,
    name: user.global_name || user.username,
    ...(user.avatar ? { avatarUrl: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` } : {}),
    emailVerified,
    emailAuthoritative: emailVerified,
  };
}

function hasOAuthCredentials(config?: { clientId?: string; clientSecret?: string }): boolean {
  const { clientId, clientSecret } = config ?? {};
  return (
    typeof clientId === 'string' && clientId.trim().length > 0 &&
    typeof clientSecret === 'string' && clientSecret.trim().length > 0
  );
}

async function getGitHubPrimaryEmail(accessToken: string): Promise<GitHubPrimaryEmail | undefined> {
  try {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'OAuth-Client',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return undefined;

    const result = githubEmailsSchema.safeParse(await response.json());
    return result.success ? result.data.find((email) => email.primary) : undefined;
  } catch {
    // A missing email must not prevent sign-in by an existing provider account ID.
    return undefined;
  }
}

const oauthProviders: readonly OAuthProviderDefinition[] = [
  {
    ...oauthProviderInfo.google,
    isEnabled: (config) => hasOAuthCredentials(config.oauth?.google),
    createHandler: (onProfile, onError) => defineOAuthGoogleEventHandler({
      config: { scope: ['openid', 'email', 'profile'] },
      async onSuccess(event, { user }: { user: GoogleOAuthUser }) {
        return onProfile(event, googleProfile(user));
      },
      onError,
    }),
  },
  {
    ...oauthProviderInfo.github,
    isEnabled: (config) => hasOAuthCredentials(config.oauth?.github),
    createHandler: (onProfile, onError) => defineOAuthGitHubEventHandler({
      config: { scope: ['user:email'], emailRequired: false },
      async onSuccess(event, { user, tokens }) {
        // The library fetches this only when emailRequired is set and /user has no public email.
        const primaryEmail = await getGitHubPrimaryEmail(tokens.access_token);
        return onProfile(event, githubProfile(user, primaryEmail));
      },
      onError,
    }),
  },
  {
    ...oauthProviderInfo.discord,
    isEnabled: (config) => hasOAuthCredentials(config.oauth?.discord),
    createHandler: (onProfile, onError) => defineOAuthDiscordEventHandler({
      config: { scope: ['identify', 'email'] },
      async onSuccess(event, { user }: { user: DiscordOAuthUser }) {
        return onProfile(event, discordProfile(user));
      },
      onError,
    }),
  },
];
