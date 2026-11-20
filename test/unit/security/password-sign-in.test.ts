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
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, email_verified INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0, is_locked INTEGER DEFAULT 0,
      onboarding_pending INTEGER NOT NULL DEFAULT 0,
      onboarding_completed_steps TEXT NOT NULL DEFAULT '[]',
      last_login_at INTEGER, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE user_passwords (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL, updated_at INTEGER NOT NULL
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
  vi.stubGlobal('getRouterParam', () => '1');
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

const newAccount = {
  username: 'new-member',
  name: 'New Member',
  email: 'new@example.com',
  password: 'Secret#123',
};

async function registerAccount() {
  const { default: handler } =
    await import('../../../layers/auth-password/server/api/auth/register-password.post');
  body = {
    ...newAccount,
    'confirm-password': newAccount.password,
    'cf-turnstile-response': 'token',
  };
  return handler({});
}

async function adminCreateAccount() {
  await loadPasswordMethod();
  const { default: handler } =
    await import('../../../layers/admin-users/server/api/admin/users/index.post');
  body = newAccount;
  return handler({});
}

async function editAccount() {
  await loadPasswordMethod();
  const { default: handler } =
    await import('../../../layers/admin-users/server/api/admin/users/[id]/index.put');
  body = { id: '1', name: 'Changed', password: newAccount.password };
  return handler({});
}

async function readNewAccount() {
  return db.select().from(users).where(eq(users.username, newAccount.username)).get();
}

describe.each([
  ['password registration', registerAccount],
  ['admin user creation', adminCreateAccount],
])('%s', (_name, createAccount) => {
  it('has no persisted user to strand if hashing is interrupted', async () => {
    const hashFailure = new Error('hash interrupted');
    const accountsAtHash: unknown[] = [];
    vi.stubGlobal('hashPassword', async () => {
      accountsAtHash.push(await readNewAccount());
      throw hashFailure;
    });

    await expect(createAccount()).rejects.toBe(hashFailure);
    expect(accountsAtHash).toEqual([undefined]);
    expect(await readNewAccount()).toBeUndefined();
  });

  it('commits a user and a password for the same account', async () => {
    await createAccount();

    const [account] = await db
      .select({ email: users.email, hash: userPasswords.passwordHash })
      .from(users)
      .innerJoin(userPasswords, eq(users.id, userPasswords.userId))
      .where(eq(users.username, newAccount.username));
    expect(account).toEqual({ email: newAccount.email, hash: 'hashed:Secret#123' });
  });

  it('rolls back user creation when the password insert fails', async () => {
    await refusePasswordWrites();

    await expect(createAccount()).rejects.toThrow();
    expect(await readNewAccount()).toBeUndefined();
  });
});

async function refusePasswordWrites() {
  await client.execute(`
    CREATE TRIGGER refuse_password BEFORE INSERT ON user_passwords
    BEGIN SELECT RAISE(ABORT, 'credential write failed'); END;
  `);
}

it('leaves an admin-edited profile unchanged when the password write fails', async () => {
  await refusePasswordWrites();

  await expect(editAccount()).rejects.toThrow();
  const account = await db.select().from(users).where(eq(users.id, 1)).get();
  expect(account?.name).toBe('Member');
});

it('replaces the password and saves the admin-edited profile together', async () => {
  await db.insert(userPasswords).values({ userId: 1, passwordHash: 'old-hash' });

  expect(await editAccount()).toMatchObject({ success: true, data: { user: { name: 'Changed' } } });
  const credential = await db.select().from(userPasswords).where(eq(userPasswords.userId, 1)).get();
  expect(credential?.passwordHash).toBe('hashed:Secret#123');
});
