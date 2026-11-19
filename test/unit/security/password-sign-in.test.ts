import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../../layers/auth/server/db/schema.sqlite';
import { userPasswords } from '../../../layers/auth-password/server/db/schema.sqlite';

vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));

const client = createClient({ url: ':memory:' });
const db = drizzle(client);
const setUserSession = vi.fn();
let body: Record<string, string> = {};

// Hashing belongs to nuxt-auth-utils; a reversible stand-in keeps the hash distinct from the password.
const hashPassword = async (password: string) => `hashed:${password}`;
const verifyPassword = async (hash: string, password: string) => hash === `hashed:${password}`;

/** Installs what a project with password sign-in runs at startup. */
async function loadPasswordMethod() {
  const { getSignInMethod } = await import('../../../layers/auth/server/utils/signInMethods');
  const { default: passwordSignIn } =
    await import('../../../layers/auth-password/server/plugins/password-sign-in');
  const { default: accountLock } = await import('../../../layers/auth/server/plugins/account-lock');
  passwordSignIn();
  accountLock();
  const method = getSignInMethod('password');
  if (!method?.setSecret) throw new Error('Missing password sign-in method');
  return { countCredentials: method.countCredentials, setSecret: method.setSecret };
}

async function signInWithPassword(password: string) {
  const { default: handler } =
    await import('../../../layers/auth-password/server/api/auth/login-password.post');
  body = { username: 'member', password, 'cf-turnstile-response': 'token', 'redirect-to': '/app' };
  return handler({});
}

beforeEach(async () => {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS user_passwords;
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL, email_verified INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0, is_locked INTEGER DEFAULT 0,
      last_login_at INTEGER, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE user_passwords (
      user_id INTEGER PRIMARY KEY, password_hash TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  await db.insert(users).values({
    id: 1,
    username: 'member',
    name: 'Member',
    email: 'member@example.com',
    emailVerified: true,
  });
  setUserSession.mockClear();
  vi.resetModules();
  vi.stubGlobal('tables', { users, userPasswords });
  vi.stubGlobal('useDB', () => db);
  vi.stubGlobal('hashPassword', hashPassword);
  vi.stubGlobal('verifyPassword', verifyPassword);
  vi.stubGlobal('defineNitroPlugin', (plugin: () => void) => plugin);
  vi.stubGlobal('defineEventHandler', (handler: (event: object) => Promise<unknown>) => handler);
  vi.stubGlobal(
    'readValidatedBody',
    async (_event: object, validate: (input: unknown) => unknown) => validate(body),
  );
  vi.stubGlobal('verifyTurnstileToken', async () => ({ success: true }));
  vi.stubGlobal('getRequestURL', () => new URL('http://localhost/api/auth/login-password'));
  vi.stubGlobal('sendRedirect', (_event: object, location: string) => ({ redirect: location }));
  vi.stubGlobal('setUserSession', setUserSession);
  vi.stubGlobal('useNitroApp', () => ({ hooks: { callHook: async () => {} } }));
  vi.stubGlobal('createError', (options: object) => Object.assign(new Error('API error'), options));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => client.close());

describe('password sign-in method', () => {
  it('counts a password only once one is set, and the set password signs in', async () => {
    const { countCredentials, setSecret } = await loadPasswordMethod();
    expect(await countCredentials(1)).toBe(0);
    expect(await signInWithPassword('Secret#123')).toEqual({
      redirect: '/auth/login?error=invalid-credentials',
    });

    await setSecret(1, 'Secret#123');

    expect(await countCredentials(1)).toBe(1);
    const [row] = await db.select().from(userPasswords).where(eq(userPasswords.userId, 1));
    expect(row?.passwordHash).not.toBe('Secret#123');
    expect(await signInWithPassword('Secret#123')).toEqual({ redirect: '/app' });
    expect(setUserSession).toHaveBeenCalledOnce();
  });

  it('replaces the password, so the old one stops working', async () => {
    const { countCredentials, setSecret } = await loadPasswordMethod();
    await setSecret(1, 'Secret#123');
    await setSecret(1, 'Changed#456');

    expect(await countCredentials(1)).toBe(1);
    expect(await signInWithPassword('Secret#123')).toEqual({
      redirect: '/auth/login?error=invalid-credentials',
    });
    expect(await signInWithPassword('Changed#456')).toEqual({ redirect: '/app' });
  });

  it('sends a locked account back to the login page with account-locked', async () => {
    const { setSecret } = await loadPasswordMethod();
    await setSecret(1, 'Secret#123');
    await db.update(users).set({ isLocked: true });

    expect(await signInWithPassword('Secret#123')).toEqual({
      redirect: '/auth/login?error=account-locked',
    });
    expect(setUserSession).not.toHaveBeenCalled();
  });
});
