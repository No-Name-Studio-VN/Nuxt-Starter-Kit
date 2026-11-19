import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../../layers/auth/server/db/schema.sqlite';
import type { LoginPolicy, LoginPolicyOutcome } from '../../../layers/auth/types/loginPolicies';
import type { OAuthSignInEvidence } from '../../../layers/auth-oauth/types/oauth';
import type { SignInEvidence } from '../../../layers/auth/types/signInMethods';

vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));

const client = createClient({ url: ':memory:' });
const db = drizzle(client);
const event = { path: '/sign-in' };
const signedInHandlers: Array<(evidence: SignInEvidence) => Promise<void>> = [];
const setUserSession = vi.fn();

async function loadSignIn() {
  const policies = await import('../../../layers/auth/server/utils/loginPolicies');
  const methods = await import('../../../layers/auth/server/utils/signInMethods');
  const { completeSignIn } = await import('../../../layers/auth/server/utils/completeSignIn');
  return { ...policies, ...methods, completeSignIn };
}

async function getUser(id = 1) {
  const user = await db.select().from(users).where(eq(users.id, id)).get();
  if (!user) throw new Error('Missing test user');
  return user;
}

function policy(id: string, run: LoginPolicy['run'], methods?: string[]): LoginPolicy {
  return { id, order: 100, run, ...(methods ? { methods } : {}) };
}

beforeEach(async () => {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL, email_verified INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0, is_locked INTEGER DEFAULT 0,
      last_login_at INTEGER, created_at INTEGER, updated_at INTEGER
    );
  `);
  await db.insert(users).values({
    id: 1,
    username: 'member',
    name: 'Member',
    email: 'member@example.com',
  });
  signedInHandlers.length = 0;
  setUserSession.mockClear();
  vi.resetModules();
  vi.stubGlobal('tables', { users });
  vi.stubGlobal('useDB', () => db);
  vi.stubGlobal('setUserSession', setUserSession);
  vi.stubGlobal('useNitroApp', () => ({
    hooks: {
      async callHook(name: string, evidence: SignInEvidence) {
        if (name !== 'auth:signed-in') return;
        for (const handler of signedInHandlers) await handler(evidence);
      },
    },
  }));
  vi.stubGlobal('createError', (options: object) => Object.assign(new Error('API error'), options));
  vi.stubGlobal('defineNitroPlugin', (plugin: () => void) => plugin);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => client.close());

describe('sign-in method registry', () => {
  it('sums credentials across methods and refuses to remove the only one', async () => {
    const { registerSignInMethod, listUserSignInMethods, assertCanRemoveCredential } =
      await loadSignIn();
    registerSignInMethod({ id: 'password', countCredentials: async () => 0 });
    registerSignInMethod({ id: 'oauth', countCredentials: async () => 1 });

    expect(await listUserSignInMethods(1)).toEqual({ password: 0, oauth: 1 });
    await expect(assertCanRemoveCredential(1)).rejects.toMatchObject({
      status: 400,
      data: { error: { code: 'ONLY_SIGNIN_METHOD' } },
    });

    registerSignInMethod({ id: 'passkey', countCredentials: async () => 1 });
    expect(await listUserSignInMethods(1)).toEqual({ password: 0, oauth: 1, passkey: 1 });
    await expect(assertCanRemoveCredential(1)).resolves.toBeUndefined();
  });

  it('refuses a user with no way in at all', async () => {
    const { registerSignInMethod, assertCanRemoveCredential } = await loadSignIn();
    registerSignInMethod({ id: 'password', countCredentials: async () => 0 });

    await expect(assertCanRemoveCredential(1)).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a second method with the same id', async () => {
    const { registerSignInMethod, getSignInMethod } = await loadSignIn();
    const password = { id: 'password', countCredentials: async () => 1 };
    registerSignInMethod(password);

    expect(() =>
      registerSignInMethod({ id: 'password', countCredentials: async () => 0 }),
    ).toThrow();
    expect(getSignInMethod('password')).toBe(password);
  });
});

describe('login policies by method', () => {
  it('runs a password-only policy for password but not for oauth', async () => {
    const { registerLoginPolicy, completeSignIn } = await loadSignIn();
    const denied: LoginPolicyOutcome = {
      kind: 'deny',
      error: { status: 403, statusText: 'Forbidden', message: 'No' },
    };
    registerLoginPolicy(policy('password-only', async () => denied, ['password']));

    expect(
      await completeSignIn(event, await getUser(), { method: 'password', redirectTo: '/' }),
    ).toEqual(denied);
    expect(setUserSession).not.toHaveBeenCalled();

    expect(
      await completeSignIn(event, await getUser(), { method: 'oauth', redirectTo: '/' }),
    ).toEqual({ kind: 'continue' });
    expect(setUserSession).toHaveBeenCalledOnce();
  });

  it('runs a policy without methods for every method', async () => {
    const { registerLoginPolicy, completeSignIn } = await loadSignIn();
    const seen: string[] = [];
    registerLoginPolicy(
      policy('every-method', async ({ method }) => {
        seen.push(method);
        return { kind: 'continue' };
      }),
    );

    for (const method of ['password', 'oauth', 'passkey']) {
      await completeSignIn(event, await getUser(), { method, redirectTo: '/' });
    }
    expect(seen).toEqual(['password', 'oauth', 'passkey']);
  });

  it('denies a locked account on every method', async () => {
    const { completeSignIn } = await loadSignIn();
    const { default: accountLock } =
      await import('../../../layers/auth/server/plugins/account-lock');
    accountLock();
    await db.update(users).set({ isLocked: true });

    for (const method of ['password', 'oauth', 'passkey']) {
      expect(
        await completeSignIn(event, await getUser(), { method, redirectTo: '/' }),
      ).toMatchObject({
        kind: 'deny',
        error: { status: 403, code: 'ACCOUNT_LOCKED' },
      });
    }
    expect(setUserSession).not.toHaveBeenCalled();
    expect((await getUser()).lastLoginAt).toBeNull();
  });
});

describe('completeSignIn', () => {
  it('writes the session from the row as the signed-in hook left it', async () => {
    const { completeSignIn } = await loadSignIn();
    const evidence: SignInEvidence[] = [];
    signedInHandlers.push(async (signIn) => {
      evidence.push(signIn);
      await db.update(users).set({ isAdmin: true }).where(eq(users.id, signIn.user.id));
    });
    const oauth: OAuthSignInEvidence = {
      provider: 'github',
      providerAccountId: '1234567',
      email: 'gh@example.com',
    };

    const outcome = await completeSignIn(event, await getUser(), {
      method: 'oauth',
      redirectTo: '/',
      oauth,
    });

    expect(outcome).toEqual({ kind: 'continue' });
    expect(evidence).toMatchObject([{ method: 'oauth', oauth, user: { id: 1 } }]);
    expect(setUserSession).toHaveBeenCalledExactlyOnceWith(event, {
      user: { id: 1, username: 'member', name: 'Member', isAdmin: true, skipLockOnInit: true },
    });
    expect((await getUser()).lastLoginAt).toBeInstanceOf(Date);
  });

  it.each<LoginPolicyOutcome>([
    { kind: 'respond', body: { redirect: '/auth/verify-email' } },
    { kind: 'deny', error: { status: 403, statusText: 'Forbidden', message: 'No' } },
  ])('writes nothing and calls no hook on $kind', async (stop) => {
    const { registerLoginPolicy, completeSignIn } = await loadSignIn();
    const hook = vi.fn(async () => {});
    signedInHandlers.push(hook);
    registerLoginPolicy(policy('stop', async () => stop));

    expect(
      await completeSignIn(event, await getUser(), { method: 'password', redirectTo: '/' }),
    ).toEqual(stop);
    expect(hook).not.toHaveBeenCalled();
    expect(setUserSession).not.toHaveBeenCalled();
    expect((await getUser()).lastLoginAt).toBeNull();
  });
});
