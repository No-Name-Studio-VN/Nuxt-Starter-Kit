import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { RequestEvent } from 'nuxt/server';
import { createError, getRouterParam, readValidatedBody } from 'nuxt/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { oauthAccounts, users } from '../../../layers/auth/server/db/schema.sqlite';
import { credentials } from '../../../layers/auth-passkeys/server/db/schema.sqlite';
import userService from '../../../layers/auth/server/utils/database/user';

vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));

const client = createClient({ url: ':memory:' });
const db = drizzle(client);
const defineHandler = vi.fn((handler: (event: RequestEvent) => Promise<unknown>) => handler);
const session = {
  id: 'session-id',
  user: { id: 1, name: 'Member', username: 'member', isAdmin: false, onboardingPending: false },
  loggedInAt: new Date('2026-11-20T12:00:00Z'),
};

function requestEvent(path: string, method: string, body?: object, id = '1') {
  const url = new URL(path, 'https://example.test');
  const req = new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  return { url, req, res: { headers: new Headers() }, context: { params: { id } } };
}

function callHandler(path: string, method: string, body: object, id = '1') {
  const handler = defineHandler.mock.lastCall?.[0];
  if (!handler) throw new Error('Route handler not registered');
  return handler(requestEvent(path, method, body, id));
}

async function setPassword(currentPassword?: string) {
  await import('../../../layers/auth/server/api/users/[id]/password.patch');
  return callHandler('/api/users/1/password', 'PATCH', {
    currentPassword,
    newPassword: 'New-password1',
    confirmPassword: 'New-password1',
  });
}

async function unlinkGoogle() {
  const { default: unlink } = await import('../../../layers/auth/server/api/auth/oauth/unlink.delete');
  return unlink(requestEvent('/api/auth/oauth/unlink', 'DELETE', { provider: 'google' }));
}

async function removePasskey(credentialId = 'credential') {
  const { default: remove } = await import('../../../layers/auth-passkeys/server/api/users/[id]/passkeys/index.delete');
  return remove(requestEvent('/api/users/1/passkeys', 'DELETE', { credentialId }));
}

async function getProfile(id = '1') {
  const { default: profile } = await import('../../../layers/auth/server/api/users/[id]/index.get');
  return profile(requestEvent(`/api/users/${id}`, 'GET', undefined, id));
}

async function enablePasskeys() {
  await client.execute(`
    CREATE TABLE credentials (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      public_key TEXT NOT NULL, counter INTEGER NOT NULL, backed_up INTEGER NOT NULL,
      transports TEXT NOT NULL, last_used_at INTEGER, created_at INTEGER, updated_at INTEGER
    )
  `);
  vi.stubGlobal('tables', { users, oauthAccounts, credentials });
  vi.stubGlobal('defineNitroPlugin', (plugin: () => void) => plugin());
  await import('../../../layers/auth-passkeys/server/plugins/sign-in-methods');
}

async function addPasskey(id = 'credential', userId = 1) {
  await db.insert(credentials).values({
    id, userId, publicKey: 'public-key', counter: 0, backedUp: false, transports: ['internal'],
  });
}

beforeEach(async () => {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS credentials;
    DROP TABLE IF EXISTS oauth_accounts;
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0, is_locked INTEGER NOT NULL DEFAULT 0,
      onboarding_pending INTEGER NOT NULL DEFAULT 0,
      onboarding_completed_steps TEXT NOT NULL DEFAULT '[]',
      password_changed_at INTEGER, last_login_at INTEGER, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE oauth_accounts (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL, provider_account_id TEXT NOT NULL, email TEXT,
      name TEXT, avatar_url TEXT, created_at INTEGER, updated_at INTEGER,
      UNIQUE (provider, provider_account_id), UNIQUE (user_id, provider)
    );
  `);
  await db.insert(users).values({
    id: 1, username: 'member', name: 'Member', password: '', email: 'member@example.test',
  });
  await db.insert(oauthAccounts).values({ userId: 1, provider: 'google', providerAccountId: '123' });

  vi.resetModules();
  defineHandler.mockClear();
  vi.stubGlobal('defineEventHandler', defineHandler);
  vi.stubGlobal('readValidatedBody', readValidatedBody);
  vi.stubGlobal('getRouterParam', getRouterParam);
  vi.stubGlobal('createError', createError);
  vi.stubGlobal('requireUserSession', async () => session);
  vi.stubGlobal('getUserSession', async () => session);
  vi.stubGlobal('tables', { users, oauthAccounts });
  vi.stubGlobal('useDB', () => db);
  vi.stubGlobal('hashPassword', async (input: string) => `test-hash:${input}`);
  vi.stubGlobal('verifyPassword', async (hash: string, input: string) => hash === `test-hash:${input}`);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
afterAll(() => client.close());

describe('account passwords', () => {
  it('shows an unknown password change date in the profile until a password is set', async () => {
    await expect(getProfile()).resolves.toMatchObject({ data: { passwordChangedAt: null } });
    await setPassword();
    await expect(getProfile()).resolves.toMatchObject({ data: { passwordChangedAt: expect.any(Date) } });
  });

  it('records the password when bootstrapping the default administrator', async () => {
    const { seedDatabase } = await import('../../../layers/admin/server/utils/database/seed');
    await seedDatabase('Seed-password1');

    expect(await userService.getByUsername('admin')).toMatchObject({
      password: 'test-hash:Seed-password1', passwordChangedAt: expect.any(Date),
    });
  });
  it('sets a password for an OAuth-only account without a current password', async () => {
    await expect(setPassword()).resolves.toMatchObject({ success: true });
    expect(await userService.getById(1)).toMatchObject({
      password: 'test-hash:New-password1', passwordChangedAt: expect.any(Date),
    });
  });

  it('still requires the current password when a password exists', async () => {
    await userService.update({ id: 1, password: 'test-hash:Old-password1' });

    await expect(setPassword()).rejects.toMatchObject({
      statusCode: 400, data: { error: { code: 'VALIDATION_ERROR' } },
    });
    expect((await userService.getById(1))?.password).toBe('test-hash:Old-password1');
  });

  it('rejects an incorrect current password', async () => {
    await userService.update({ id: 1, password: 'test-hash:Old-password1' });

    await expect(setPassword('Wrong-password1')).rejects.toMatchObject({
      statusCode: 401, data: { error: { code: 'INVALID_CURRENT_PASSWORD' } },
    });
    expect((await userService.getById(1))?.password).toBe('test-hash:Old-password1');
  });

  it('still changes a password when the current password matches', async () => {
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    await userService.update({ id: 1, password: 'test-hash:Old-password1' });
    const changedAt = new Date('2026-11-20T13:00:00Z');
    vi.setSystemTime(changedAt);

    await expect(setPassword('Old-password1')).resolves.toMatchObject({ success: true });
    expect(await userService.getById(1)).toMatchObject({
      password: 'test-hash:New-password1', passwordChangedAt: changedAt,
    });
  });

  it('does not let an administrator set another account’s initial password here', async () => {
    await userService.update({ id: 1, isAdmin: true });
    await db.insert(users).values({
      id: 2, username: 'other', name: 'Other', password: '', email: 'other@example.test',
    });
    await import('../../../layers/auth/server/api/users/[id]/password.patch');

    await expect(callHandler('/api/users/2/password', 'PATCH', {
      newPassword: 'New-password1', confirmPassword: 'New-password1',
    }, '2')).rejects.toMatchObject({ statusCode: 403, data: { error: { code: 'USER_ID_MISMATCH' } } });
    expect((await userService.getById(2))?.password).toBe('');
  });

  it('does not overwrite a password set by a concurrent request', async () => {
    vi.stubGlobal('hashPassword', async () => {
      await userService.update({ id: 1, password: 'test-hash:Other-password1' });
      return 'test-hash:New-password1';
    });

    await expect(setPassword()).rejects.toMatchObject({
      statusCode: 409, data: { error: { code: 'PASSWORD_SET_CONFLICT' } },
    });
    expect((await userService.getById(1))?.password).toBe('test-hash:Other-password1');
  });

  it('works without the passkeys layer and refuses to unlink the only sign-in method', async () => {
    await expect(getProfile()).resolves.toMatchObject({ data: { contributedSignInMethodCount: 0 } });
    await expect(unlinkGoogle()).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ONLY_SIGNIN_METHOD' } } });
    expect(await db.select().from(oauthAccounts)).toHaveLength(1);
  });

  it('allows unlinking the only provider after a password has been set', async () => {
    await setPassword();

    await expect(unlinkGoogle()).resolves.toMatchObject({ success: true, data: { unlinked: true } });
    expect(await db.select().from(oauthAccounts)).toHaveLength(0);
  });
});

describe('sign-in method removal with passkeys installed', () => {
  beforeEach(async () => {
    await enablePasskeys();
    await addPasskey();
  });

  it('allows unlinking the only provider if the user has a passkey but no password', async () => {
    await expect(getProfile()).resolves.toMatchObject({ data: { hasPassword: false, contributedSignInMethodCount: 1 } });
    await expect(unlinkGoogle()).resolves.toMatchObject({ success: true, data: { unlinked: true } });
    expect(await db.select().from(oauthAccounts)).toHaveLength(0);
  });

  it('refuses to remove the last passkey without a password or linked account', async () => {
    await db.delete(oauthAccounts);
    await userService.update({ id: 1, password: '\t\u00A0' });
    await expect(removePasskey()).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ONLY_SIGNIN_METHOD' } } });
    expect(await db.select().from(credentials)).toHaveLength(1);
  });

  it.each(['password', 'OAuth'])('allows removing the last passkey when %s remains', async (method) => {
    if (method === 'password') {
      await db.delete(oauthAccounts);
      await userService.update({ id: 1, password: 'test-hash:New-password1' });
    }
    await expect(removePasskey()).resolves.toMatchObject({ success: true });
    await expect(getProfile()).resolves.toMatchObject({ data: { contributedSignInMethodCount: 0 } });
    expect(await db.select().from(credentials)).toHaveLength(0);
  });

  it('allows removing one of two passkeys without a password or linked account', async () => {
    await db.delete(oauthAccounts);
    await addPasskey('other-credential');
    await expect(getProfile()).resolves.toMatchObject({ data: { contributedSignInMethodCount: 2 } });
    await expect(removePasskey()).resolves.toMatchObject({ success: true });
    expect(await db.select({ id: credentials.id }).from(credentials)).toEqual([{ id: 'other-credential' }]);
  });

  it('scopes the profile count to the requested user, including when accessed by an administrator', async () => {
    await userService.update({ id: 1, isAdmin: true });
    await db.insert(users).values({ id: 2, username: 'other', name: 'Other', password: '', email: 'other@example.test' });
    await expect(getProfile('2')).resolves.toMatchObject({ data: { id: 2, contributedSignInMethodCount: 0 } });
    await addPasskey('other-user-credential', 2);
    await expect(getProfile('2')).resolves.toMatchObject({ data: { id: 2, contributedSignInMethodCount: 1 } });
    await expect(removePasskey('other-user-credential')).rejects.toMatchObject({ statusCode: 404, data: { error: { code: 'PASSKEY_NOT_FOUND' } } });
  });

  it('leaves a sign-in method when both DELETEs are submitted concurrently', async () => {
    const results = await Promise.allSettled([unlinkGoogle(), removePasskey()]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toMatchObject([{
      reason: { statusCode: 400, data: { error: { code: 'ONLY_SIGNIN_METHOD' } } },
    }]);
    const accounts = await db.select().from(oauthAccounts);
    const passkeys = await db.select().from(credentials);
    expect(accounts.length + passkeys.length).toBe(1);
  });
});
