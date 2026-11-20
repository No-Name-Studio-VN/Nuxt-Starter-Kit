import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../../layers/auth/server/db/schema.sqlite';
import type { SignInEvidence } from '../../../layers/auth/types/signInMethods';
import type * as AdminAccess from '../../../layers/admin/server/utils/adminAccess';

vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));
const { shouldGrantAdmin } = vi.hoisted(() => ({
  shouldGrantAdmin: vi.fn<(signIn: SignInEvidence) => boolean>(),
}));
vi.mock('../../../layers/admin/server/utils/adminAccess', () => ({ shouldGrantAdmin }));

const client = createClient({ url: ':memory:' });
const db = drizzle(client);
const setUserSession = vi.fn();
const signedInHandlers: Array<(evidence: SignInEvidence) => Promise<void>> = [];

async function getUser() {
  const user = await db.select().from(users).where(eq(users.id, 1)).get();
  if (!user) throw new Error('Missing test user');
  return user;
}

/** Installs the admin plugin, then signs the user in with GitHub. */
async function signIn() {
  const { default: adminAccess } =
    await import('../../../layers/admin/server/plugins/admin-access');
  adminAccess({
    hooks: {
      hook(name: string, handler: (evidence: SignInEvidence) => Promise<void>) {
        if (name === 'auth:signed-in') signedInHandlers.push(handler);
      },
    },
  });
  const { completeSignIn } = await import('../../../layers/auth/server/utils/completeSignIn');
  return completeSignIn({}, await getUser(), {
    method: 'oauth',
    redirectTo: '/',
    oauth: { provider: 'github', providerAccountId: '1234567', email: 'gh@example.com' },
  });
}

beforeEach(async () => {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL, email_verified INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0, is_locked INTEGER DEFAULT 0,
      onboarding_pending INTEGER NOT NULL DEFAULT 0,
      onboarding_completed_steps TEXT NOT NULL DEFAULT '[]',
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
  shouldGrantAdmin.mockReset().mockReturnValue(false);
  vi.resetModules();
  vi.stubGlobal('tables', { users });
  vi.stubGlobal('useDB', () => db);
  vi.stubGlobal('setUserSession', setUserSession);
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin);
  vi.stubGlobal('useNitroApp', () => ({
    hooks: {
      async callHook(name: string, evidence: SignInEvidence) {
        if (name !== 'auth:signed-in') return;
        for (const handler of signedInHandlers) await handler(evidence);
      },
    },
  }));
  vi.stubGlobal('createError', (options: object) => Object.assign(new Error('API error'), options));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => client.close());

describe('admin access on sign-in', () => {
  it('leaves everyone a member while the placeholder is unchanged', async () => {
    const placeholder = await vi.importActual<typeof AdminAccess>(
      '../../../layers/admin/server/utils/adminAccess',
    );
    shouldGrantAdmin.mockImplementation(placeholder.shouldGrantAdmin);

    await signIn();
    expect((await getUser()).isAdmin).toBe(false);
    expect(setUserSession).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ user: expect.objectContaining({ isAdmin: false }) }),
    );
  });

  it('grants admin, in the session too, when shouldGrantAdmin returns true', async () => {
    shouldGrantAdmin.mockReturnValue(true);

    await signIn();

    expect(shouldGrantAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'oauth',
        oauth: expect.objectContaining({ provider: 'github', providerAccountId: '1234567' }),
      }),
    );
    expect((await getUser()).isAdmin).toBe(true);
    expect(setUserSession).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ user: expect.objectContaining({ isAdmin: true }) }),
    );
  });

  it('never revokes an existing admin', async () => {
    await db.update(users).set({ isAdmin: true });

    await signIn();

    expect((await getUser()).isAdmin).toBe(true);
    expect(setUserSession).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ user: expect.objectContaining({ isAdmin: true }) }),
    );
  });
});
