import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import type * as NuxtServer from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';
import type { OAuthProfile } from '../../../layers/auth-oauth/types/providers';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../../layers/auth/server/db/schema.sqlite';
import { oauthAccounts } from '../../../layers/auth-oauth/server/db/schema.sqlite';

vi.mock('../../../layers/auth-oauth/server/utils/googleIdentity', () => ({
  verifyGoogleIdToken: async () => ({
    subject: 'google-id',
    email: 'member@example.com',
    name: 'Member',
  }),
}));
vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));

const client = createClient({ url: ':memory:' });
const db = drizzle(client);
const profile = {
  providerAccountId: 'google-id',
  email: 'member@example.com',
  name: 'Member',
  emailVerified: false,
  emailAuthoritative: false,
} satisfies OAuthProfile;
const setUserSession = vi.fn();
const cookies = new Map<string, string>();
const runtimeConfig = vi.hoisted(() => ({
  public: { site: { auth: { oauth: ['google'] } } },
  oauth: { google: { clientId: 'test-client-id', clientSecret: 'test-client-secret' } },
}));
vi.mock('nuxt/server', async (importOriginal) => ({
  ...(await importOriginal<typeof NuxtServer>()),
  useRuntimeConfig: () => runtimeConfig,
}));

let event: RequestEvent;

function createEvent(path: string): RequestEvent {
  const url = new URL(path, 'https://example.test');
  const cookie = [...cookies]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
  return {
    url,
    req: new Request(url, { headers: { cookie } }),
    res: { headers: new Headers() },
    context: { params: { provider: 'google' } },
  };
}

function expectCookiesExpired() {
  expect(event.res.headers.getSetCookie()).toEqual([
    'oauth_popup=; Max-Age=0; Path=/',
    'oauth_redirect_to=; Max-Age=0; Path=/',
  ]);
}

beforeEach(async () => {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS oauth_accounts;
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, email_verified INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0, is_locked INTEGER DEFAULT 0,
      onboarding_pending INTEGER NOT NULL DEFAULT 0,
      onboarding_completed_steps TEXT NOT NULL DEFAULT '[]',
      last_login_at INTEGER, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE oauth_accounts (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL, provider_account_id TEXT NOT NULL,
      email TEXT, name TEXT, avatar_url TEXT, created_at INTEGER, updated_at INTEGER,
      UNIQUE(provider, provider_account_id), UNIQUE(user_id, provider)
    );
  `);
  await db
    .insert(users)
    .values({ id: 1, username: 'member', name: 'Member', email: profile.email });
  cookies.clear();
  cookies.set('oauth_redirect_to', '/app');
  setUserSession.mockClear();
  vi.resetModules();
  vi.stubGlobal('tables', { users, oauthAccounts });
  vi.stubGlobal('useDB', () => db);
  vi.stubGlobal('getUserSession', async () => ({}));
  vi.stubGlobal('setUserSession', setUserSession);
  vi.stubGlobal('defineEventHandler', (handler: (event: object) => Promise<unknown>) => handler);
  vi.stubGlobal('readBody', async () => ({ credential: 'fixture-token' }));
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { googleOneTapClientId: 'test-client-id' } }));
  vi.stubGlobal('createError', (options: object) => Object.assign(new Error('API error'), options));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => client.close());

async function requireSignInStep() {
  const { registerLoginPolicy } = await import('../../../layers/auth/server/utils/loginPolicies');
  const respond = vi.fn();
  registerLoginPolicy({
    id: 'challenge',
    order: 100,
    async run() {
      return { kind: 'respond', respond };
    },
  });
  await db.insert(oauthAccounts).values({
    userId: 1,
    provider: 'google',
    providerAccountId: profile.providerAccountId,
  });
}

async function finishOAuthCallback() {
  const { handleOAuthSuccess } = await import('../../../layers/auth-oauth/server/utils/oauth');
  event = createEvent('/api/auth/google');
  await handleOAuthSuccess(event, 'google', profile);
}

async function finishGoogleOneTap() {
  const { default: handler } =
    await import('../../../layers/auth-oauth/server/api/auth/google-one-tap.post');
  event = createEvent('/api/auth/google-one-tap');
  return handler(event);
}

describe('OAuth login completion', () => {
  it('rejects One Tap when a policy requires a response and does not write a session', async () => {
    await requireSignInStep();
    cookies.set('oauth_popup', '1');

    await expect(finishGoogleOneTap()).rejects.toMatchObject({
      status: 403,
      data: { error: { code: 'SIGN_IN_STEP_REQUIRED' } },
    });
    expectCookiesExpired();
    expect(event.res.headers.has('location')).toBe(false);
    expect(setUserSession).not.toHaveBeenCalled();
    const user = await db.select().from(users).where(eq(users.id, 1)).get();
    expect(user?.lastLoginAt).toBeNull();
  });

  it('sends a required policy step to the opener as a login error', async () => {
    await requireSignInStep();
    cookies.set('oauth_popup', '1');

    await finishOAuthCallback();
    expect(event.res.headers.get('location')).toBe(
      '/auth/oauth/popup?redirectTo=%2Fauth%2Flogin%3Ferror%3Dsign-in-step-required',
    );
    expectCookiesExpired();
    expect(setUserSession).not.toHaveBeenCalled();
  });

  it.each([
    ['redirect', '/auth/login?error=oauth-email-in-use'],
    ['popup', '/auth/oauth/popup?redirectTo=%2Fauth%2Flogin%3Ferror%3Doauth-email-in-use'],
  ])('does not create or link a guest with a taken email in %s mode', async (mode, redirect) => {
    if (mode === 'popup') cookies.set('oauth_popup', '1');

    await finishOAuthCallback();
    expect(event.res.headers.get('location')).toBe(redirect);
    expect(await db.select({ id: users.id }).from(users)).toEqual([{ id: 1 }]);
    expect(await db.select().from(oauthAccounts)).toEqual([]);
    expectCookiesExpired();
    expect(setUserSession).not.toHaveBeenCalled();
  });

  it('returns a conflict when a One Tap email already belongs to another account', async () => {
    await expect(finishGoogleOneTap()).rejects.toMatchObject({
      status: 409,
      data: { error: { code: 'OAUTH_EMAIL_IN_USE' } },
    });
    expect(await db.select({ id: users.id }).from(users)).toEqual([{ id: 1 }]);
    expect(await db.select().from(oauthAccounts)).toEqual([]);
    expectCookiesExpired();
    expect(setUserSession).not.toHaveBeenCalled();
  });
});

describe('OAuth callback failures', () => {
  it.each([{ error: 'access_denied' }, { code: '' }])(
    'returns a rejected callback to the popup and expires its request cookies',
    async (query) => {
      cookies.set('oauth_popup', '1');
      const search = new URLSearchParams(
        Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
      );
      event = createEvent(`/api/auth/google?${search}`);
      const { default: callback } =
        await import('../../../layers/auth-oauth/server/api/auth/[provider].get');

      await callback(event);
      expect(event.res.headers.get('location')).toBe(
        '/auth/oauth/popup?redirectTo=%2Fauth%2Flogin%3Ferror%3Doauth-error',
      );
      expectCookiesExpired();
    },
  );

  it('returns the popup to login when the provider handler throws', async () => {
    cookies.set('oauth_popup', '1');
    event = createEvent('/api/auth/google?code=provider-code');
    vi.stubGlobal('defineOAuthGoogleEventHandler', () => async () => {
      throw new Error('Provider request failed');
    });
    const { default: callback } =
      await import('../../../layers/auth-oauth/server/api/auth/[provider].get');

    await callback(event);
    expect(event.res.headers.get('location')).toBe(
      '/auth/oauth/popup?redirectTo=%2Fauth%2Flogin%3Ferror%3Doauth-error',
    );
    expectCookiesExpired();
  });
});
