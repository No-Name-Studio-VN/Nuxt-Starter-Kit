import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { UserSession } from '#auth-utils';
import type { RequestEvent } from 'nuxt/server';
import {
  createError,
  getQuery,
  getRouterParam,
  getRequestURL,
  readValidatedBody,
} from 'nuxt/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../../layers/auth/server/db/schema.sqlite';
import { userPasswords } from '../../../layers/auth-password/server/db/schema.sqlite';
import userService from '../../../layers/auth/server/utils/database/user';
import { usernameSchema } from '../../../layers/auth/shared/schemas/userSchema';

vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));

const client = createClient({ url: ':memory:' });
const db = drizzle(client);
const defineHandler = vi.fn((handler: (event: RequestEvent) => Promise<unknown>) => handler);
let session: UserSession;

function createEvent(path: string, params: Record<string, string> = {}, init?: RequestInit): RequestEvent {
  const url = new URL(path, 'https://example.test');
  return { url, req: new Request(url, init), res: { headers: new Headers() }, context: { params } };
}

function callHandler(event: RequestEvent) {
  const handler = defineHandler.mock.lastCall?.[0];
  if (!handler) throw new Error('Route handler not registered');
  return handler(event);
}

async function checkAvailability(username: string) {
  await import('../../../layers/auth/server/api/users/username-availability.get');
  return callHandler(createEvent(`/api/users/username-availability?${new URLSearchParams({ username })}`));
}

async function patchUsername(username: string, id = 'me') {
  await import('../../../layers/auth/server/api/users/[id]/username.patch');
  return callHandler(createEvent(`/api/users/${id}/username`, { id }, {
    method: 'PATCH',
    body: JSON.stringify({ username }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

beforeEach(async () => {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS user_passwords;
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0, is_locked INTEGER NOT NULL DEFAULT 0,
      onboarding_pending INTEGER NOT NULL DEFAULT 0,
      onboarding_completed_steps TEXT NOT NULL DEFAULT '[]',
      last_login_at INTEGER, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE user_passwords (
      user_id INTEGER PRIMARY KEY REFERENCES users(id), password_hash TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  await db.insert(users).values([
    { id: 1, username: 'john_doe', name: 'John', email: 'john@example.test', onboardingPending: true },
    { id: 2, username: 'other', name: 'Other', email: 'other@example.test' },
  ]);
  session = {
    id: 'session-id',
    user: {
      id: 1, username: 'john_doe', name: 'John', isAdmin: false,
      onboardingPending: true, skipLockOnInit: true, avatarUrl: 'https://example.test/avatar.png',
    },
    loggedInAt: new Date('2026-11-20T12:00:00Z'),
    secure: { marker: 'keep' },
  };
  vi.resetModules();
  defineHandler.mockClear();
  vi.stubGlobal('defineEventHandler', defineHandler);
  vi.stubGlobal('getQuery', getQuery);
  vi.stubGlobal('getRouterParam', getRouterParam);
  vi.stubGlobal('readValidatedBody', readValidatedBody);
  vi.stubGlobal('createError', createError);
  vi.stubGlobal('tables', { users, userPasswords });
  vi.stubGlobal('useNitroApp', () => ({ hooks: { callHook: vi.fn() } }));
  vi.stubGlobal('useDB', () => db);
  vi.stubGlobal('getUserSession', async () => session);
  vi.stubGlobal('requireUserSession', async () => {
    if (!session.user) throw createError({ status: 401, message: 'Unauthorized' });
    return session;
  });
  vi.stubGlobal('setUserSession', async (_event: RequestEvent, data: Pick<UserSession, 'user'>) => {
    session = { ...session, ...data };
    return session;
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(() => client.close());

describe('username validation', () => {
  it('trims and lowercases a username before validation', () => {
    expect(usernameSchema.parse('  John_Doe ')).toBe('john_doe');
  });

  it.each(['john.doe', 'ab'])('rejects %s', (username) => {
    expect(usernameSchema.safeParse(username).success).toBe(false);
  });
});

describe('username sign-in', () => {
  it('accepts a mixed-case username after normalized password registration', async () => {
    const password = 'ValidPassword1!';
    const credentials = { username: '  Jane_Doe ', password, 'cf-turnstile-response': 'test-token' };
    const post = (path: string, body: object) => callHandler(createEvent(path, {}, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }));
    session = { id: 'anonymous' };
    vi.stubGlobal('getRequestURL', getRequestURL);
    vi.stubGlobal('sendRedirect', (_event: RequestEvent, target: string) => target);
    vi.stubGlobal('verifyTurnstileToken', async () => ({ success: true }));
    vi.stubGlobal('hashPassword', async () => 'test-hash');
    vi.stubGlobal('verifyPassword', async (hash: string, input: string) =>
      hash === 'test-hash' && input === password);

    await import('../../../layers/auth-password/server/api/auth/register-password.post');
    expect(await post('/api/auth/register-password', {
      ...credentials,
      name: 'Jane',
      email: 'jane@example.test',
      'confirm-password': password,
    })).toBe('/auth/login?redirectTo=%2F');
    expect(await userService.getByEmail('jane@example.test')).toMatchObject({ username: 'jane_doe' });

    await import('../../../layers/auth-password/server/api/auth/login-password.post');
    expect(await post('/api/auth/login-password', credentials)).toBe('/');
    expect(session.user?.username).toBe('jane_doe');
  });
});

describe('username availability', () => {
  it.each([
    { username: '  Other ', available: false },
    { username: '  John_Doe ', available: true },
    { username: '  Free_Name ', available: true },
  ])('reports $username as available: $available', async ({ username, available }) => {
    expect(await checkAvailability(username)).toMatchObject({ success: true, data: { available } });
  });

  it.each(['john.doe', 'ab'])('returns a validation error for %s', async (username) => {
    await expect(checkAvailability(username)).rejects.toMatchObject({
      statusCode: 400, data: { error: { code: 'VALIDATION_ERROR' } },
    });
  });

  it('requires a signed-in user', async () => {
    session = { id: 'anonymous' };
    await expect(checkAvailability('free_name')).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('username change', () => {
  it.each(['john.doe', 'ab'])('returns a validation error for %s', async (username) => {
    await expect(patchUsername(username)).rejects.toMatchObject({
      statusCode: 400, data: { error: { code: 'VALIDATION_ERROR' } },
    });
  });

  it('returns a conflict for a name owned by another user', async () => {
    await expect(patchUsername('  Other ')).rejects.toMatchObject({
      statusCode: 409, data: { error: { code: 'USERNAME_TAKEN' } },
    });
    expect(await userService.getById(1)).toMatchObject({ username: 'john_doe' });
    expect(session.user?.username).toBe('john_doe');
  });

  it('returns the same conflict when a concurrent write claims the name', async () => {
    const { default: service } = await import('../../../layers/auth/server/utils/database/user');
    const update = service.update.bind(service);
    vi.spyOn(service, 'update').mockImplementationOnce(async (data) => {
      await db.insert(users).values({
        id: 3, username: 'claimed_name', name: 'Racing User', email: 'race@example.test',
      });
      return update(data);
    });

    await expect(patchUsername('claimed_name')).rejects.toMatchObject({
      statusCode: 409, data: { error: { code: 'USERNAME_TAKEN' } },
    });
    expect(await userService.getByUsername('claimed_name')).toMatchObject({ id: 3 });
    expect(await userService.getById(1)).toMatchObject({ username: 'john_doe' });
    expect(session.user?.username).toBe('john_doe');
  });

  it('updates the normalized username in the database and keeps other session data', async () => {
    const previousSession = session;
    expect(await patchUsername('  New_Name ')).toMatchObject({
      success: true,
      data: { id: 1, username: 'new_name', name: 'John', email: 'john@example.test' },
    });
    expect(await userService.getById(1)).toMatchObject({ username: 'new_name' });
    expect(session).toStrictEqual({
      ...previousSession,
      user: {
        id: 1, username: 'new_name', name: 'John', isAdmin: false,
        onboardingPending: true, skipLockOnInit: true, avatarUrl: 'https://example.test/avatar.png',
      },
    });
  });

  it('denies a non-admin changing another user’s username', async () => {
    await expect(patchUsername('new_name', '2')).rejects.toMatchObject({ statusCode: 403 });
    expect(await userService.getById(2)).toMatchObject({ username: 'other' });
  });

  it('does not overwrite the admin’s session when changing another user’s username', async () => {
    const admin = await userService.update({ id: 1, isAdmin: true });
    if (!admin || !session.user) throw new Error('Admin fixture not found');
    session.user.isAdmin = admin.isAdmin;
    const previousSession = structuredClone(session);

    expect(await patchUsername('new_name', '2')).toMatchObject({
      success: true, data: { id: 2, username: 'new_name' },
    });
    expect(await userService.getById(2)).toMatchObject({ username: 'new_name' });
    expect(session).toStrictEqual(previousSession);
  });
});
