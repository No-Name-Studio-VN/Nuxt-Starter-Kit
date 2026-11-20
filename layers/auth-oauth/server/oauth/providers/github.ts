import { defineOAuthProvider } from '../defineOAuthProvider';
import { githubEmailsSchema } from '../../../shared/schemas/oauthSchema';
import type { GitHubOAuthResult } from '../../../types/providerResults';

async function getGitHubPrimaryEmail(accessToken: string) {
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
    return result.success ? result.data.find((email) => email.primary && email.verified) : undefined;
  } catch {
    // A missing email must not prevent sign-in by an existing provider account ID.
    return undefined;
  }
}

export default defineOAuthProvider({
  id: 'github',
  createHandler: ({ onSuccess, onError }) =>
    defineOAuthGitHubEventHandler({ config: { scope: ['user:email'], emailRequired: false }, onSuccess, onError }),
  async toAccount({ user, tokens }: GitHubOAuthResult) {
    const primaryEmail = await getGitHubPrimaryEmail(tokens.access_token);
    return {
      providerAccountId: typeof user.id === 'number' ? String(user.id) : undefined,
      email: primaryEmail?.email,
      name: user.name ?? user.login,
      avatarUrl: user.avatar_url,
      emailVerified: Boolean(primaryEmail),
      emailAuthoritative: Boolean(primaryEmail),
    };
  },
});
