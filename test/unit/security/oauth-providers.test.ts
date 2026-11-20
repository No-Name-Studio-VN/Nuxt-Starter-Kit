import type { RequestEvent } from 'nuxt/server';
import { createError, defineEventHandler, readBody, readValidatedBody } from 'nuxt/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OAuthProfile } from '../../../layers/auth/types/auth';
import { verifyGoogleIdToken } from '../../../layers/auth/server/utils/googleIdentity';

const config = vi.hoisted(() => ({
  oauth: {
    google: { clientId: 'google-id', clientSecret: 'google-secret' },
    github: { clientId: 'github-id', clientSecret: '' },
    discord: { clientId: '', clientSecret: 'discord-secret' },
  },
  public: { googleOneTapClientId: 'one-tap-client' },
}));

const handleOAuthSuccess = vi.hoisted(() =>
  vi.fn(async (_event: RequestEvent, provider: string, profile: OAuthProfile) => ({
    provider,
    profile,
  })),
);
const completeOAuthLogin = vi.hoisted(() => vi.fn(async () => ({ status: 'signed-in', userId: 1 })));
vi.mock('#layers/auth/server/utils/oauth', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../layers/auth/server/utils/oauth')>(),
  handleOAuthSuccess,
  completeOAuthLogin,
}));

function createEvent(path: string, provider?: string, body?: object): RequestEvent {
  const url = new URL(path, 'https://example.com');
  return {
    url,
    req: new Request(url, body && {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    res: { headers: new Headers() },
    context: { params: { provider } },
  };
}

function stubOAuthHandlers() {
  vi.stubGlobal('defineOAuthGoogleEventHandler', () => async () => 'Google handler');
  vi.stubGlobal('defineOAuthGitHubEventHandler', () => async () => 'GitHub handler');
  vi.stubGlobal('defineOAuthDiscordEventHandler', () => async () => 'Discord handler');
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('useRuntimeConfig', () => config);
  vi.stubGlobal('defineEventHandler', defineEventHandler);
  vi.stubGlobal('createError', createError);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stubOAuthHandlers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  config.oauth.github.clientSecret = '';
  config.oauth.discord.clientId = '';
});

const googleUser = { sub: 'google-1', name: 'Google User' };
const githubUser = { id: 42, login: 'octocat', name: null, email: 'public@example.com' };
const discordUser = { id: 'discord-1', username: 'discord-user' };

async function loadRegistry() {
  return import('../../../layers/auth/server/utils/oauthProviders');
}

describe('OAuth email trust', () => {
  it.each([
    { email: 'a@gmail.com', authoritative: true },
    { email: 'a@corp.com', hd: 'corp.com', authoritative: true },
    { email: 'a@outlook.com', authoritative: false },
  ])('derives Google authority for $email', async ({ email, hd, authoritative }) => {
    const { googleProfile } = await loadRegistry();
    expect(googleProfile({ ...googleUser, email, hd, email_verified: true })).toMatchObject({
      email,
      emailVerified: true,
      emailAuthoritative: authoritative,
    });
  });

  it.each([false, undefined])('does not verify Google email for claim %s', async (claim) => {
    const { googleProfile } = await loadRegistry();
    expect(googleProfile({ ...googleUser, email: 'a@gmail.com', email_verified: claim })).toMatchObject({
      emailVerified: false,
      emailAuthoritative: true,
    });
  });

  it('does not normalize the email in the mapped profile', async () => {
    const { googleProfile } = await loadRegistry();
    const email = ' A@GMAIL.COM ';
    expect(googleProfile({ ...googleUser, email, email_verified: true }).email).toBe(email);
  });

  it.each([true, false])('takes GitHub verification (%s) from the primary email', async (verified) => {
    const { githubProfile } = await loadRegistry();
    expect(githubProfile(githubUser, { email: 'primary@example.com', verified })).toMatchObject({
      id: '42',
      email: 'primary@example.com',
      name: 'octocat',
      emailVerified: verified,
      emailAuthoritative: verified,
    });
  });

  it.each([true, false, undefined])('derives Discord trust from verification (%s)', async (verified) => {
    const { discordProfile } = await loadRegistry();
    expect(discordProfile({ ...discordUser, email: 'a@example.com', verified })).toMatchObject({
      email: 'a@example.com',
      emailVerified: verified === true,
      emailAuthoritative: verified === true,
    });
  });

  it('uses empty, untrusted email for each provider when none was returned', async () => {
    const { googleProfile, githubProfile, discordProfile } = await loadRegistry();
    const profiles = [
      googleProfile({ ...googleUser, hd: 'corp.com', email_verified: true }),
      githubProfile(githubUser, undefined),
      discordProfile({ ...discordUser, verified: true }),
    ];

    for (const profile of profiles) {
      expect(profile).toMatchObject({ email: '', emailVerified: false, emailAuthoritative: false });
    }
  });

  it.each([
    { email: 'a@corp.com', hd: 'corp.com', emailAuthoritative: true },
    { email: 'a@outlook.com', emailAuthoritative: false },
  ])('passes One Tap trust flags for $email to the shared sign-in path', async ({ email, hd, emailAuthoritative }) => {
    const googleIdentity = await import('../../../layers/auth/server/utils/googleIdentity');
    vi.spyOn(googleIdentity, 'verifyGoogleIdToken').mockResolvedValue({
      issuer: 'https://accounts.google.com',
      audience: 'one-tap-client',
      subject: 'google-1',
      email,
      emailVerified: true,
      name: 'Google User',
      hd,
      issuedAt: 0,
      expiresAt: 600,
    });
    vi.stubGlobal('getUserSession', async () => ({}));
    vi.stubGlobal('readBody', readBody);
    const { default: oneTap } = await import('../../../layers/auth/server/api/auth/google-one-tap.post');
    const event = createEvent('/api/auth/google-one-tap', undefined, { credential: 'test credential' });

    await expect(oneTap(event)).resolves.toMatchObject({ data: { authenticated: true } });
    expect(completeOAuthLogin).toHaveBeenCalledWith(event, 'google', expect.objectContaining({
      email,
      emailVerified: true,
      emailAuthoritative,
    }));
  });

  it('preserves the signed Google Workspace claim for One Tap', async () => {
    const now = new Date('2026-11-20T00:00:00Z');
    const issuedAt = now.getTime() / 1000;
    const token = [
      { alg: 'RS256', kid: 'test-key' },
      {
        iss: 'https://accounts.google.com',
        aud: 'one-tap-client',
        sub: 'google-1',
        email: 'a@corp.com',
        email_verified: true,
        hd: 'corp.com',
        iat: issuedAt,
        exp: issuedAt + 600,
      },
    ].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');

    await expect(verifyGoogleIdToken({
      token: `${token}.AA`,
      audience: 'one-tap-client',
      now,
      loadJwks: async () => [{ kid: 'test-key', kty: 'RSA', n: 'test', e: 'AQAB' }],
      verifySignature: async () => true,
    })).resolves.toMatchObject({ emailVerified: true, hd: 'corp.com' });
  });
});

describe('OAuth provider dispatch', () => {
  it('requires both credentials to enable a provider', async () => {
    const { getEnabledOAuthProviders } = await loadRegistry();
    expect(getEnabledOAuthProviders(useRuntimeConfig()).map(({ id }) => id)).toEqual(['google']);

    config.oauth.github.clientSecret = 'github-secret';
    config.oauth.discord.clientId = 'discord-id';
    expect(getEnabledOAuthProviders(useRuntimeConfig()).map(({ id }) => id)).toEqual([
      'google', 'github', 'discord',
    ]);
  });

  it.each(['unknown', 'github', 'discord'])('404s for unavailable provider %s', async (provider) => {
    const { default: dispatch } = await import('../../../layers/auth/server/api/auth/[provider].get');
    const event = createEvent(`/api/auth/${provider}`, provider);
    await expect(dispatch(event)).rejects.toMatchObject({
      status: 404,
      data: { error: { code: 'OAUTH_PROVIDER_ERROR' } },
    });
  });

  it('logs provider errors without exposing credentials and still redirects to login', async () => {
    const failure = createError({
      status: 401,
      message: 'OAuth token exchange failed',
      data: { access_token: 'do-not-log' },
    });
    vi.stubGlobal('defineOAuthGoogleEventHandler', (
      options: Parameters<typeof defineOAuthGoogleEventHandler>[0],
    ) => async (event: RequestEvent) => options.onError?.(event, failure));

    const { default: dispatch } = await import('../../../layers/auth/server/api/auth/[provider].get');
    const event = createEvent('/api/auth/google?code=code', 'google');
    await dispatch(event);

    expect(event.res.status).toBe(302);
    expect(event.res.headers.get('location')).toBe('/auth/login?error=oauth-error');
    expect(console.error).toHaveBeenCalledExactlyOnceWith('[Google OAuth] Error:', { status: 401 });
  });

  it('rejects a popup URL request for a disabled provider', async () => {
    vi.stubGlobal('readValidatedBody', readValidatedBody);
    const { default: createPopupUrl } = await import('../../../layers/auth/server/api/auth/oauth/url.post');
    config.oauth.google.clientSecret = '';
    try {
      await expect(createPopupUrl(createEvent('/api/auth/oauth/url', undefined, { provider: 'google' })))
        .rejects.toMatchObject({ status: 400, data: { error: { code: 'UNSUPPORTED_OAUTH_PROVIDER' } } });
    } finally {
      config.oauth.google.clientSecret = 'google-secret';
    }
  });

  it('returns only enabled provider metadata without requiring a session', async () => {
    const { default: listProviders } = await import('../../../layers/auth/server/api/auth/oauth/providers.get');
    const event = createEvent('/api/auth/oauth/providers');
    const response = await listProviders(event);
    expect(response.data).toEqual({ providers: [{ id: 'google', name: 'Google', icon: 'google' }] });
  });

  it('builds Discord popup URLs and remembers their same-origin return path', async () => {
    config.oauth.discord.clientId = 'discord-id';
    vi.stubGlobal('readValidatedBody', readValidatedBody);
    const { default: createPopupUrl } = await import('../../../layers/auth/server/api/auth/oauth/url.post');
    const { default: dispatch } = await import('../../../layers/auth/server/api/auth/[provider].get');
    const response = await createPopupUrl(createEvent('/api/auth/oauth/url', undefined, {
      provider: 'discord',
      action: 'link',
      redirectTo: '/settings/security',
    }));
    expect(response.data.url).toBe('/api/auth/discord?popup=1&action=link&redirectTo=%2Fsettings%2Fsecurity');

    const event = createEvent(response.data.url, 'discord');
    await expect(dispatch(event)).resolves.toBe('Discord handler');
    expect(event.res.headers.getSetCookie()).toEqual(expect.arrayContaining([
      expect.stringMatching(/^oauth_popup=1;/),
      expect.stringMatching(/^oauth_redirect_to=%2Fsettings%2Fsecurity;/),
    ]));
  });

  it('fetches GitHub primary email even when the public profile has an email', async () => {
    config.oauth.github.clientSecret = 'github-secret';
    const githubFactory = vi.fn((options: Parameters<typeof defineOAuthGitHubEventHandler>[0]) =>
      async (event: RequestEvent) => options.onSuccess(event, {
        // Only the relevant provider fields are read by the application.
        user: {
          ...githubUser, name: '', node_id: '', avatar_url: '', gravatar_id: '', url: '', html_url: '',
          followers_url: '', following_url: '', gists_url: '', starred_url: '', subscriptions_url: '',
          organizations_url: '', repos_url: '', events_url: '', received_events_url: '', type: 'User',
          site_admin: false, company: '', blog: '', location: '', hireable: null, bio: null,
          twitter_username: null, public_repos: 0, public_gists: 0, followers: 0, following: 0,
          created_at: '', updated_at: '', email_verified: true,
        },
        tokens: { access_token: 'access-token', scope: 'user:email', token_type: 'bearer' },
      }),
    );
    vi.stubGlobal('defineOAuthGitHubEventHandler', githubFactory);
    const fetchEmails = vi.fn(async () => Response.json([
      { email: 'secondary@example.com', primary: false, verified: true },
      { email: 'primary@example.com', primary: true, verified: false },
    ]));
    vi.stubGlobal('fetch', fetchEmails);

    const { default: dispatch } = await import('../../../layers/auth/server/api/auth/[provider].get');
    await expect(dispatch(createEvent('/api/auth/github?code=code', 'github'))).resolves.toMatchObject({
      provider: 'github',
      profile: { email: 'primary@example.com', emailVerified: false, emailAuthoritative: false },
    });
    expect(githubFactory).toHaveBeenCalledWith(expect.objectContaining({
      config: { scope: ['user:email'], emailRequired: false },
    }));
    expect(fetchEmails).toHaveBeenCalledWith('https://api.github.com/user/emails', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
    }));
  });
});
