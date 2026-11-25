import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import type { RequestEvent } from 'nuxt/server';
import { createError, defineEventHandler, readBody } from 'nuxt/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userTwoFactor } from '../../../layers/auth-2fa/server/db/schema.sqlite';
import { users } from '../../../layers/auth/server/db/schema.sqlite';
import { oauthAccounts } from '../../../layers/auth-oauth/server/db/schema.sqlite';
import type {
  OAuthHandlerCallbacks,
  OAuthProfile,
} from '../../../layers/auth-oauth/types/providers';
import type { LoginPolicyOutcome } from '../../../layers/auth/types/loginPolicies';
import type userServiceModule from '../../../layers/auth/server/utils/database/user';
import type oauthAccountServiceModule from '../../../layers/auth-oauth/server/utils/database/oauthAccount';
import type * as OAuthModule from '../../../layers/auth-oauth/server/utils/oauth';

let userService: typeof userServiceModule;
let oauthAccountService: typeof oauthAccountServiceModule;
let completeOAuthLogin: typeof OAuthModule.completeOAuthLogin;
let handleOAuthSuccess: typeof OAuthModule.handleOAuthSuccess;

vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));
vi.mock('../../../layers/auth-oauth/server/utils/googleIdentity', () => ({
  verifyGoogleIdToken: vi.fn(async () => ({
    subject: 'provider-account',
    email: 'john@gmail.com',
    emailVerified: true,
    name: 'Provider Name',
  })),
}));

const client = createClient({ url: ':memory:' });
const db = drizzle(client);
const setSession = vi.fn();
const callHook = vi.fn();
const loginDenial = {
  kind: 'deny',
  error: { status: 403, statusText: 'Forbidden', message: 'OAuth sign-in is not allowed.' },
} satisfies LoginPolicyOutcome;
const profile: OAuthProfile = {
  providerAccountId: 'provider-account',
  email: 'john@gmail.com',
  name: 'Provider Name',
  avatarUrl: 'https://example.com/new-avatar.png',
  emailVerified: true,
  emailAuthoritative: true,
};

function eventFor(path = '/api/auth/google', init?: RequestInit): RequestEvent {
  const url = new URL(path, 'https://example.com');
  return { url, req: new Request(url, init), res: { headers: new Headers() }, context: {} };
}

async function seedUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const user = await db
    .insert(users)
    .values({
      id: 1,
      username: 'john',
      name: 'John',
      email: 'john@gmail.com',
      emailVerified: true,
      onboardingPending: false,
      onboardingCompletedSteps: [],
      ...overrides,
    })
    .returning()
    .get();
  if (!user) throw new Error('Could not seed user');
  return user;
}

async function seedLink(providerAccountId = profile.providerAccountId) {
  await db.insert(oauthAccounts).values({
    userId: 1,
    provider: 'google',
    providerAccountId,
    email: 'old@example.com',
    name: 'Old Name',
    avatarUrl: 'https://example.com/old-avatar.png',
  });
}

function complete(overrides: Partial<OAuthProfile> = {}) {
  const candidate = { ...profile, ...overrides };
  return completeOAuthLogin(eventFor(), 'google', {
    ...candidate,
    email: candidate.email?.trim().toLowerCase() || undefined,
  });
}

async function expectRefusal(code: string, overrides: Partial<OAuthProfile> = {}, linkCount = 0) {
  expect(await complete(overrides)).toEqual({ status: 'refused', code });
  expect(setSession).not.toHaveBeenCalled();
  expect(await db.select().from(oauthAccounts)).toHaveLength(linkCount);
}

beforeEach(async () => {
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    DROP TABLE IF EXISTS user_two_factor;
    DROP TABLE IF EXISTS oauth_accounts;
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0, is_locked INTEGER NOT NULL DEFAULT 0,
      onboarding_pending INTEGER NOT NULL DEFAULT 0,
      onboarding_completed_steps TEXT NOT NULL DEFAULT '[]',
      last_login_at INTEGER, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE oauth_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL, provider_account_id TEXT NOT NULL, email TEXT, name TEXT,
      avatar_url TEXT, created_at INTEGER, updated_at INTEGER,
      UNIQUE (provider, provider_account_id), UNIQUE (user_id, provider)
    );
    CREATE TABLE user_two_factor (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret TEXT, enabled INTEGER NOT NULL DEFAULT 0, backup_codes TEXT,
      created_at INTEGER, updated_at INTEGER
    );
  `);
  vi.resetModules();
  setSession.mockClear();
  callHook.mockClear();
  vi.stubGlobal('useNitroApp', () => ({ hooks: { callHook } }));
  vi.stubGlobal('tables', { users, oauthAccounts, userTwoFactor });
  vi.stubGlobal('useDB', () => db);
  vi.stubGlobal('setUserSession', setSession);
  vi.stubGlobal('getUserSession', async () => ({}));
  vi.stubGlobal('defineNitroPlugin', (registerPlugin: () => void) => registerPlugin());
  vi.stubGlobal('defineEventHandler', defineEventHandler);
  vi.stubGlobal('createError', createError);
  vi.stubGlobal('readBody', readBody);
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { googleOneTapClientId: 'test-client' } }));
  await import('../../../layers/auth-oauth/server/plugins/oauth-sign-in');
  ({ default: userService } = await import('../../../layers/auth/server/utils/database/user'));
  ({ default: oauthAccountService } =
    await import('../../../layers/auth-oauth/server/utils/database/oauthAccount'));
  ({ completeOAuthLogin, handleOAuthSuccess } =
    await import('../../../layers/auth-oauth/server/utils/oauth'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => client.close());

describe('OAuth sign-in and linking', () => {
  it('uses permanent provider identity and refreshes only link display fields', async () => {
    await seedUser({ onboardingPending: true });
    await seedUser({ id: 2, username: 'other', email: 'new@example.com' });
    await seedLink();

    expect(await complete({ email: 'new@example.com', emailVerified: false })).toEqual({
      status: 'signed-in',
      userId: 1,
      outcome: { kind: 'continue' },
    });
    expect(await db.select().from(oauthAccounts)).toMatchObject([
      {
        userId: 1,
        email: 'new@example.com',
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    ]);
    expect(await userService.getById(1)).toMatchObject({
      email: 'john@gmail.com',
      emailVerified: true,
      lastLoginAt: expect.any(Date),
    });
    expect(setSession).toHaveBeenCalledWith(expect.anything(), {
      user: {
        id: 1,
        username: 'john',
        name: 'John',
        isAdmin: false,
        onboardingPending: true,
        avatarUrl: profile.avatarUrl,
        skipLockOnInit: true,
      },
      loginMethod: 'oauth',
      loginProvider: 'google',
      signedInAt: expect.any(Number),
      loginMethodAt: expect.any(Number),
    });
  });

  it('signs in through an existing link even without an email or avatar', async () => {
    await seedUser();
    await seedLink();
    expect(await complete({ email: '', avatarUrl: undefined })).toEqual({
      status: 'signed-in',
      userId: 1,
      outcome: { kind: 'continue' },
    });
    expect(await db.select().from(oauthAccounts)).toMatchObject([{ email: null, avatarUrl: null }]);
    expect(setSession).toHaveBeenCalledOnce();
  });

  it('links a verified and authoritative case-insensitive, trimmed email match', async () => {
    await seedUser();
    expect(await complete({ email: ' John@Gmail.com ' })).toEqual({
      status: 'linked',
      userId: 1,
      outcome: { kind: 'continue' },
    });
    expect(await db.select().from(oauthAccounts)).toMatchObject([
      {
        provider: 'google',
        providerAccountId: profile.providerAccountId,
        userId: 1,
      },
    ]);
    expect(await db.select().from(users)).toMatchObject([
      {
        id: 1,
        email: 'john@gmail.com',
        onboardingPending: false,
        lastLoginAt: expect.any(Date),
      },
    ]);
    expect(setSession).toHaveBeenCalledWith(expect.anything(), {
      user: {
        id: 1,
        username: 'john',
        name: 'John',
        isAdmin: false,
        onboardingPending: false,
        avatarUrl: profile.avatarUrl,
        skipLockOnInit: true,
      },
      loginMethod: 'oauth',
      loginProvider: 'google',
      signedInAt: expect.any(Number),
      loginMethodAt: expect.any(Number),
    });
  });

  it('refuses an OIDC verified email match that Google can auto-link', async () => {
    const user = await seedUser();
    const identity = {
      user: {
        sub: profile.providerAccountId,
        email: user.email,
        email_verified: true,
        name: profile.name,
      },
    };
    const providerHandler =
      ({ onSuccess }: OAuthHandlerCallbacks<typeof identity>) =>
      (event: RequestEvent) =>
        onSuccess(event, identity);
    vi.stubGlobal('defineOAuthOidcEventHandler', providerHandler);
    vi.stubGlobal('defineOAuthGoogleEventHandler', providerHandler);

    const { default: oidc } =
      await import('../../../layers/auth-oauth/server/oauth/providers/oidc');
    const { default: google } =
      await import('../../../layers/auth-oauth/server/oauth/providers/google');
    const signIn = (provider: typeof oidc | typeof google) =>
      provider.createHandler({
        onSuccess: (event, account) => completeOAuthLogin(event, provider.id, account),
        onError: vi.fn(),
      })(eventFor(`/api/auth/${provider.id}`));

    expect(await signIn(oidc)).toEqual({ status: 'refused', code: 'oauth-email-in-use' });
    expect(await db.select().from(oauthAccounts)).toEqual([]);
    expect(await db.select().from(users)).toEqual([user]);
    expect(setSession).not.toHaveBeenCalled();

    expect(await signIn(google)).toEqual({
      status: 'linked',
      userId: user.id,
      outcome: { kind: 'continue' },
    });
    expect(await db.select().from(oauthAccounts)).toMatchObject([
      {
        userId: user.id,
        provider: 'google',
        providerAccountId: identity.user.sub,
      },
    ]);
    expect(setSession).toHaveBeenCalledOnce();
  });

  it.each([
    { emailVerified: true, emailAuthoritative: false },
    { emailVerified: false, emailAuthoritative: true },
  ])('refuses an email in use without both trust flags (%j)', async (trust) => {
    await seedUser();
    await expectRefusal('oauth-email-in-use', trust);
  });

  it('refuses a match with an unverified local email', async () => {
    await seedUser({ emailVerified: false });
    await expectRefusal('oauth-email-in-use');
  });

  it('refuses ambiguous legacy case-variant email matches', async () => {
    await seedUser();
    await seedUser({ id: 2, username: 'other', email: 'John@GMAIL.com' });
    await expectRefusal('oauth-email-in-use');
  });

  it('refuses a different account of the same provider', async () => {
    await seedUser();
    await seedLink('other-provider-account');
    await expectRefusal('oauth-provider-conflict', {}, 1);
  });

  it('refuses a competing provider link inserted after the initial check', async () => {
    await seedUser();
    await seedLink('other-provider-account');
    vi.spyOn(oauthAccountService, 'getByUserAndProvider').mockResolvedValueOnce(undefined);
    await expectRefusal('oauth-provider-conflict', {}, 1);
  });

  it.each([
    { verified: true, authoritative: true, localVerified: true },
    { verified: true, authoritative: false, localVerified: false },
    { verified: false, authoritative: true, localVerified: false },
    { verified: false, authoritative: false, localVerified: false },
  ])(
    'creates a pending user with email verification $localVerified for flags $verified/$authoritative',
    async ({ verified, authoritative, localVerified }) => {
      expect(
        await complete({
          email: ' New@Gmail.com ',
          emailVerified: verified,
          emailAuthoritative: authoritative,
        }),
      ).toEqual({ status: 'created', userId: 1, outcome: { kind: 'continue' } });
      expect(await db.select().from(users)).toMatchObject([
        {
          username: 'new',
          email: 'new@gmail.com',
          emailVerified: localVerified,
          onboardingPending: true,
          onboardingCompletedSteps: [],
        },
      ]);
      expect(await db.select().from(oauthAccounts)).toMatchObject([
        {
          userId: 1,
          provider: 'google',
          providerAccountId: profile.providerAccountId,
        },
      ]);
      expect(setSession).toHaveBeenCalledWith(expect.anything(), {
        user: {
          id: 1,
          username: 'new',
          name: profile.name,
          isAdmin: false,
          onboardingPending: true,
          avatarUrl: profile.avatarUrl,
          skipLockOnInit: true,
        },
        loginMethod: 'oauth',
        loginProvider: 'google',
        signedInAt: expect.any(Number),
        loginMethodAt: expect.any(Number),
      });
    },
  );

  it.each(['', '  '])('refuses missing email %j when there is no existing link', async (email) => {
    await expectRefusal('oauth-email-missing', { email });
    expect(await db.select().from(users)).toEqual([]);
  });

  it('rolls back a new user when the OAuth insert fails', async () => {
    await client.execute(`
      CREATE TRIGGER abort_oauth_link BEFORE INSERT ON oauth_accounts
      BEGIN SELECT RAISE(ABORT, 'test link insert failure'); END;
    `);
    await expect(complete()).rejects.toThrow();
    expect(await db.select().from(users)).toEqual([]);
    expect(await db.select().from(oauthAccounts)).toEqual([]);
    expect(setSession).not.toHaveBeenCalled();
  });

  it('retries when another user wins the generated username', async () => {
    await seedUser({ email: 'other@example.com' });
    vi.spyOn(userService, 'getByUsername').mockResolvedValueOnce(undefined);
    expect(await complete()).toEqual({
      status: 'created',
      userId: 2,
      outcome: { kind: 'continue' },
    });
    expect(await userService.getById(2)).toMatchObject({
      username: expect.stringMatching(/^john-/),
      email: 'john@gmail.com',
    });
    expect(await db.select().from(oauthAccounts)).toMatchObject([{ userId: 2 }]);
  });

  it('refuses when another user wins the normalized email', async () => {
    await seedUser();
    vi.spyOn(userService, 'listByEmail').mockResolvedValueOnce([]);
    await expectRefusal('oauth-email-in-use');
    expect(await db.select().from(users)).toHaveLength(1);
  });
});

describe('OAuth login policy denial', () => {
  it('keeps a new user and link created before policy denial without completing sign-in', async () => {
    const { registerLoginPolicy } = await import('../../../layers/auth/server/utils/loginPolicies');
    const completedSignIn = vi.spyOn(
      await import('../../../layers/auth/server/utils/sessionUser'),
      'setCompletedSignIn',
    );
    registerLoginPolicy({
      id: 'deny-oauth',
      order: 100,
      methods: ['oauth'],
      async run({ user }) {
        expect(await userService.getById(user.id)).toMatchObject({
          email: profile.email,
          onboardingPending: true,
          lastLoginAt: null,
        });
        expect(
          await oauthAccountService.getByProviderAccount('google', profile.providerAccountId),
        ).toMatchObject({ userId: user.id });
        return loginDenial;
      },
    });

    expect(await complete()).toEqual({ status: 'created', userId: 1, outcome: loginDenial });
    expect(await db.select().from(users)).toMatchObject([
      {
        id: 1,
        email: profile.email,
        onboardingPending: true,
        lastLoginAt: null,
      },
    ]);
    expect(await db.select().from(oauthAccounts)).toMatchObject([
      {
        userId: 1,
        provider: 'google',
        providerAccountId: profile.providerAccountId,
      },
    ]);
    expect(callHook).not.toHaveBeenCalled();
    expect(completedSignIn).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });

  it('does not persist an existing user’s email auto-link when login policy denies', async () => {
    const user = await seedUser({ lastLoginAt: new Date('2026-11-20T12:00:00Z') });
    const { registerLoginPolicy } = await import('../../../layers/auth/server/utils/loginPolicies');
    const completedSignIn = vi.spyOn(
      await import('../../../layers/auth/server/utils/sessionUser'),
      'setCompletedSignIn',
    );
    registerLoginPolicy({
      id: 'deny-oauth',
      order: 100,
      methods: ['oauth'],
      async run() {
        expect(await db.select().from(oauthAccounts)).toEqual([]);
        return loginDenial;
      },
    });

    expect(await complete()).toEqual({ status: 'linked', userId: user.id, outcome: loginDenial });
    expect(await db.select().from(oauthAccounts)).toEqual([]);
    expect(await db.select().from(users)).toEqual([user]);
    expect(callHook).not.toHaveBeenCalled();
    expect(completedSignIn).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
  });
});

describe('OAuth link policies', () => {
  async function loadPolicyFlow() {
    const policies = await import('../../../layers/auth/server/utils/oauthLinkPolicies');
    const oauth = await import('../../../layers/auth-oauth/server/utils/oauth');
    return { ...policies, ...oauth };
  }

  it('runs policies by order and stops at the first denial of email auto-linking', async () => {
    const user = await seedUser();
    const { registerOAuthLinkPolicy, completeOAuthLogin } = await loadPolicyFlow();
    const calls: string[] = [];
    const deny = vi.fn(async () => {
      calls.push('deny');
      return { allow: false };
    });
    registerOAuthLinkPolicy({
      id: 'after',
      order: 30,
      async run() {
        calls.push('after');
        return { allow: true };
      },
    });
    registerOAuthLinkPolicy({ id: 'deny', order: 20, run: deny });
    registerOAuthLinkPolicy({
      id: 'before',
      order: 10,
      async run() {
        calls.push('before');
        return { allow: true };
      },
    });

    expect(await completeOAuthLogin(eventFor(), 'google', profile)).toEqual({
      status: 'refused',
      code: 'oauth-email-in-use',
    });
    expect(calls).toEqual(['before', 'deny']);
    expect(deny).toHaveBeenCalledWith({ user, provider: 'google' });
    expect(await db.select().from(oauthAccounts)).toEqual([]);
    expect(setSession).not.toHaveBeenCalled();
  });

  it('refuses auto-linking when 2FA is enabled, but allows the connected provider', async () => {
    const user = await seedUser();
    await db.insert(userTwoFactor).values({ userId: user.id, enabled: true });
    const { runOAuthLinkPolicies, completeOAuthLogin } = await loadPolicyFlow();
    await import('../../../layers/auth-2fa/server/plugins/oauth-link-policy');

    expect(await runOAuthLinkPolicies({ user, provider: 'google' })).toBe(false);
    expect(await completeOAuthLogin(eventFor(), 'google', profile)).toEqual({
      status: 'refused',
      code: 'oauth-email-in-use',
    });
    expect(setSession).not.toHaveBeenCalled();

    await seedLink();
    expect(await completeOAuthLogin(eventFor(), 'google', profile)).toEqual({
      status: 'signed-in',
      userId: 1,
      outcome: { kind: 'continue' },
    });
    expect(setSession).toHaveBeenCalledOnce();
  });

  it('refuses admin auto-linking but lets a signed-in admin connect and use the provider', async () => {
    const user = await seedUser({ isAdmin: true });
    const { runOAuthLinkPolicies, completeOAuthLogin, handleOAuthSuccess } = await loadPolicyFlow();
    await import('../../../layers/auth/server/plugins/oauth-link-policy');

    expect(await runOAuthLinkPolicies({ user, provider: 'google' })).toBe(false);
    expect(await completeOAuthLogin(eventFor(), 'google', profile)).toEqual({
      status: 'refused',
      code: 'oauth-email-in-use',
    });
    expect(await db.select().from(oauthAccounts)).toEqual([]);
    expect(setSession).not.toHaveBeenCalled();

    vi.stubGlobal('getUserSession', async () => ({ user: { id: 1, isAdmin: true } }));
    const event = eventFor('/api/auth/google', {
      headers: { cookie: 'oauth_popup=1; oauth_redirect_to=%2Fsettings%2Fsecurity' },
    });
    await handleOAuthSuccess(event, 'google', { ...profile, email: undefined });
    const target = '/settings/security?success=oauth-linked&provider=google';
    expect(event.res.headers.get('location')).toBe(
      `/auth/oauth/popup?redirectTo=${encodeURIComponent(target)}`,
    );
    expect(await db.select().from(oauthAccounts)).toMatchObject([{ userId: 1 }]);
    expect(await completeOAuthLogin(eventFor(), 'google', profile)).toEqual({
      status: 'signed-in',
      userId: 1,
      outcome: { kind: 'continue' },
    });
  });

  it('refuses if the matched account becomes an admin before the link is written', async () => {
    const user = await seedUser();
    const { registerOAuthLinkPolicy, completeOAuthLogin } = await loadPolicyFlow();
    await import('../../../layers/auth/server/plugins/oauth-link-policy');
    registerOAuthLinkPolicy({
      id: 'promote-during-check',
      order: 200,
      async run() {
        await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));
        return { allow: true };
      },
    });

    expect(await completeOAuthLogin(eventFor(), 'google', profile)).toEqual({
      status: 'refused',
      code: 'oauth-email-in-use',
    });
    expect(await db.select().from(oauthAccounts)).toEqual([]);
    expect(setSession).not.toHaveBeenCalled();
  });

  it('refuses if the verified email changes before the link is written', async () => {
    const user = await seedUser();
    const { registerOAuthLinkPolicy, completeOAuthLogin } = await loadPolicyFlow();
    registerOAuthLinkPolicy({
      id: 'change-email-during-check',
      order: 10,
      async run() {
        await db
          .update(users)
          .set({ email: 'new@example.com', emailVerified: false })
          .where(eq(users.id, user.id));
        return { allow: true };
      },
    });

    expect(await completeOAuthLogin(eventFor(), 'google', profile)).toEqual({
      status: 'refused',
      code: 'oauth-email-in-use',
    });
    expect(await db.select().from(oauthAccounts)).toEqual([]);
    expect(setSession).not.toHaveBeenCalled();
  });

  it('allows email auto-linking when a 2FA setup is disabled', async () => {
    const user = await seedUser();
    await db.insert(userTwoFactor).values({ userId: user.id, enabled: false });
    const { completeOAuthLogin } = await loadPolicyFlow();
    await import('../../../layers/auth-2fa/server/plugins/oauth-link-policy');
    expect(await completeOAuthLogin(eventFor(), 'google', profile)).toEqual({
      status: 'linked',
      userId: 1,
      outcome: { kind: 'continue' },
    });
  });
});

describe('OAuth callback outcomes', () => {
  it.each([false, true])('routes a created user to onboarding (popup: %s)', async (popup) => {
    const event = eventFor(
      '/api/auth/google',
      popup
        ? {
            headers: { cookie: 'oauth_popup=1; oauth_redirect_to=%2Fdashboard' },
          }
        : undefined,
    );
    await handleOAuthSuccess(event, 'google', profile);
    expect(event.res.headers.get('location')).toBe(
      popup ? '/auth/oauth/popup?redirectTo=%2Fonboarding' : '/onboarding',
    );
  });

  it('sends a refused popup sign-in back to the login error alert', async () => {
    const event = eventFor('/api/auth/google', {
      headers: { cookie: 'oauth_popup=1; oauth_redirect_to=%2Fdashboard' },
    });
    await handleOAuthSuccess(event, 'google', { ...profile, email: undefined });
    expect(event.res.headers.get('location')).toBe(
      '/auth/oauth/popup?redirectTo=%2Fauth%2Flogin%3Ferror%3Doauth-email-missing',
    );
  });

  it.each([false, true])(
    'preserves the popup destination or defaults to home (popup: %s)',
    async (popup) => {
      await seedUser();
      const init = popup
        ? { headers: { cookie: 'oauth_popup=1; oauth_redirect_to=%2Fdashboard' } }
        : undefined;
      for (const event of [
        eventFor('/api/auth/google', init),
        eventFor('/api/auth/google', init),
      ]) {
        await handleOAuthSuccess(event, 'google', profile);
        expect(event.res.headers.get('location')).toBe(
          popup ? '/auth/oauth/popup?redirectTo=%2Fdashboard' : '/',
        );
      }
    },
  );

  it('preserves explicit signed-in connecting without a provider email', async () => {
    await seedUser();
    vi.stubGlobal('getUserSession', async () => ({ user: { id: 1 } }));
    const event = eventFor('/api/auth/google', {
      headers: { cookie: 'oauth_popup=1; oauth_redirect_to=%2Fsettings%2Fsecurity' },
    });
    await handleOAuthSuccess(event, 'google', { ...profile, email: undefined });
    const target = '/settings/security?success=oauth-linked&provider=google';
    expect(event.res.headers.get('location')).toBe(
      `/auth/oauth/popup?redirectTo=${encodeURIComponent(target)}`,
    );
    expect(await db.select().from(oauthAccounts)).toMatchObject([{ userId: 1, email: null }]);
    expect(setSession).not.toHaveBeenCalled();
  });

  it.each([
    { ownerId: 1, accountId: 'other-provider-account', error: 'oauth-already-connected' },
    { ownerId: 2, accountId: profile.providerAccountId, error: 'oauth-already-linked' },
    { ownerId: 1, accountId: profile.providerAccountId, error: 'oauth-already-connected' },
  ])(
    'returns a competing popup link to settings with $error for owner $ownerId',
    async ({ ownerId, accountId, error }) => {
      await seedUser();
      await seedUser({ id: 2, email: 'other@example.com', username: 'other' });
      vi.stubGlobal('getUserSession', async () => ({ user: { id: 1 } }));
      vi.spyOn(oauthAccountService, 'getByUserAndProvider').mockImplementationOnce(async () => {
        await db
          .insert(oauthAccounts)
          .values({ userId: ownerId, provider: 'google', providerAccountId: accountId });
        return undefined;
      });

      const event = eventFor('/api/auth/google', {
        headers: { cookie: 'oauth_popup=1; oauth_redirect_to=%2Fsettings%2Fsecurity' },
      });
      await handleOAuthSuccess(event, 'google', profile);

      const target = `/settings/security?error=${error}&provider=google`;
      expect(event.res.headers.get('location')).toBe(
        `/auth/oauth/popup?redirectTo=${encodeURIComponent(target)}`,
      );
      expect(await db.select().from(oauthAccounts)).toMatchObject([
        { userId: ownerId, providerAccountId: accountId },
      ]);
    },
  );

  it('includes the same refusal code in the Google One Tap API error', async () => {
    await seedUser({ emailVerified: false });
    vi.resetModules();
    const { default: oneTap } =
      await import('../../../layers/auth-oauth/server/api/auth/google-one-tap.post');
    const event = eventFor('/api/auth/google-one-tap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: 'test credential' }),
    });
    await expect(oneTap(event)).rejects.toMatchObject({
      status: 409,
      data: { error: { code: 'OAUTH_EMAIL_IN_USE' } },
    });
  });
});
