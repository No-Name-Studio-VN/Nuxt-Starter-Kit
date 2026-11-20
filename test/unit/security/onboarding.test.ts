import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { UserSession } from '#auth-utils';
import type { RequestEvent } from 'nuxt/server';
import { createError, getRequestURL, getRouterParam, readValidatedBody } from 'nuxt/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../../layers/auth/server/db/schema.sqlite';
import { userPasswords } from '../../../layers/auth-password/server/db/schema.sqlite';
import userService from '../../../layers/auth/server/utils/database/user';

vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));

const client = createClient({ url: ':memory:' });
const db = drizzle(client);
const defineHandler = (handler: (event: RequestEvent) => Promise<unknown>) => handler;
const member = { id: 1, username: 'generated_name', name: 'Member', isAdmin: false, avatarUrl: 'https://example.test/avatar.png' };
let session: Omit<UserSession, 'user'> & {
  user?: Omit<NonNullable<UserSession['user']>, 'onboardingPending'> & { onboardingPending?: boolean };
};

function createEvent(path: string, method = 'GET', params: Record<string, string> = {}, body?: object): RequestEvent {
  const url = new URL(path, 'https://example.test');
  return {
    url,
    req: new Request(url, {
      method,
      ...(body && { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    }),
    res: { headers: new Headers() },
    context: { params },
  };
}

async function getOnboarding() {
  const { default: handler } = await import('../../../layers/auth/server/api/onboarding/index.get');
  return handler(createEvent('/api/onboarding'));
}

async function postStep(id: string) {
  const { default: handler } = await import('../../../layers/auth/server/api/onboarding/steps/[id].post');
  return handler(createEvent(`/api/onboarding/steps/${id}`, 'POST', { id }));
}

async function postComplete() {
  const { default: handler } = await import('../../../layers/auth/server/api/onboarding/complete.post');
  return handler(createEvent('/api/onboarding/complete', 'POST'));
}

async function loadRegistry() {
  await import('../../../layers/auth/server/plugins/onboarding-steps');
  return import('../../../layers/auth/server/utils/onboardingSteps');
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
    { id: member.id, username: member.username, name: member.name, email: 'member@example.test', onboardingPending: true },
    { id: 2, username: 'other', name: 'Other', email: 'other@example.test', onboardingPending: true },
  ]);
  session = {
    id: 'session-id',
    user: { ...member, onboardingPending: true, skipLockOnInit: true },
    loggedInAt: new Date('2026-11-20T12:00:00Z'),
    secure: { marker: 'keep' },
  };
  vi.resetModules();
  vi.stubGlobal('defineEventHandler', defineHandler);
  vi.stubGlobal('defineNitroPlugin', (plugin: () => void) => plugin());
  vi.stubGlobal('getRequestURL', getRequestURL);
  vi.stubGlobal('getRouterParam', getRouterParam);
  vi.stubGlobal('readValidatedBody', readValidatedBody);
  vi.stubGlobal('createError', createError);
  vi.stubGlobal('tables', { users, userPasswords });
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
  vi.stubGlobal('sendRedirect', (_event: RequestEvent, target: string) => target);
  vi.stubGlobal('verifyTurnstileToken', async () => ({ success: true }));
  vi.stubGlobal('hashPassword', async () => 'password-hash');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(() => client.close());

describe('onboarding status', () => {
  it.each([false, true])('returns username and preferences without a password row (module installed: %s)', async (installed) => {
    await loadRegistry();
    if (installed) await import('../../../layers/auth-password/server/plugins/password-sign-in');

    const response = await getOnboarding();
    expect(response.success).toBe(true);
    expect(response.data).toEqual({ pending: true, steps: ['username', 'preferences'] });
  });

  it('returns only preferences for a password account', async () => {
    await loadRegistry();
    await import('../../../layers/auth-password/server/plugins/password-sign-in');
    await db.insert(userPasswords).values({ userId: 1, passwordHash: 'hash' });

    expect(await getOnboarding()).toMatchObject({ success: true, data: { pending: true, steps: ['preferences'] } });
  });

  it('sorts extension steps, rejects duplicate IDs and awaits applicability', async () => {
    const { registerOnboardingStep } = await loadRegistry();
    registerOnboardingStep({ id: 'profile', order: 200, isApplicable: async (user) => user.id === 1 });
    registerOnboardingStep({ id: 'hidden', order: 50, isApplicable: async () => false });
    expect(() => registerOnboardingStep({ id: 'profile', order: 1, isApplicable: () => true })).toThrow();

    expect(await getOnboarding()).toMatchObject({
      data: { steps: ['username', 'profile', 'preferences'] },
    });
  });

  it('omits a step completed from another session', async () => {
    await loadRegistry();
    await db.update(users).set({ onboardingCompletedSteps: ['username'] });

    expect(await getOnboarding()).toMatchObject({ data: { pending: true, steps: ['preferences'] } });
  });

  it.each([true, undefined])('refreshes a stale session whose pending flag is %j', async (onboardingPending) => {
    await loadRegistry();
    await db.update(users).set({ onboardingPending: false });
    session.user = { ...member, skipLockOnInit: true, ...(onboardingPending === undefined ? {} : { onboardingPending }) };
    const before = session;

    expect(await getOnboarding()).toMatchObject({ data: { pending: false } });
    expect(session).toStrictEqual({ ...before, user: { ...member, onboardingPending: false, skipLockOnInit: true } });
  });
});

describe('onboarding mutations', () => {
  it.each(['unknown', 'welcome', 'username'])('rejects the unknown or inapplicable step %s', async (id) => {
    await loadRegistry();
    await import('../../../layers/auth-password/server/plugins/password-sign-in');
    await db.insert(userPasswords).values({ userId: 1, passwordHash: 'hash' });
    await expect(postStep(id)).rejects.toMatchObject({
      statusCode: 400, data: { error: { code: 'ONBOARDING_STEP_INVALID' } },
    });
    expect(await userService.getById(1)).toMatchObject({ onboardingCompletedSteps: [] });
  });

  it('records an applicable step only once and only for the session user', async () => {
    await loadRegistry();
    const expected = { success: true, data: { steps: ['preferences'] } };

    expect(await postStep('username')).toMatchObject(expected);
    expect(await postStep('username')).toMatchObject(expected);
    expect(await userService.getById(1)).toMatchObject({ onboardingCompletedSteps: ['username'], onboardingPending: true });
    expect(await userService.getById(2)).toMatchObject({ onboardingCompletedSteps: [] });
  });

  it('does not lose or duplicate steps submitted concurrently', async () => {
    const { registerOnboardingStep } = await loadRegistry();
    let arrivals = 0;
    const { promise, resolve } = Promise.withResolvers<void>();
    const isApplicable = async () => {
      if (++arrivals === 3) resolve();
      await promise;
      return true;
    };
    registerOnboardingStep({ id: 'first', order: 200, isApplicable });
    registerOnboardingStep({ id: 'second', order: 300, isApplicable });

    await Promise.all([postStep('first'), postStep('second'), postStep('first')]);

    const user = await userService.getById(1);
    expect(user?.onboardingCompletedSteps.toSorted()).toEqual(['first', 'second']);
  });

  it('completes onboarding without losing session data and can be repeated', async () => {
    await loadRegistry();
    const before = session;
    const expected = { success: true, data: { pending: false } };

    expect(await postComplete()).toMatchObject(expected);
    expect(await userService.getById(1)).toMatchObject({ onboardingPending: false });
    expect(await userService.getById(2)).toMatchObject({ onboardingPending: true });
    expect(session).toStrictEqual({ ...before, user: { ...member, onboardingPending: false, skipLockOnInit: true } });
    expect(await postComplete()).toMatchObject(expected);
  });

  it('requires a signed-in user on all three endpoints', async () => {
    await loadRegistry();
    session = { id: 'anonymous' };

    await expect(getOnboarding()).rejects.toMatchObject({ statusCode: 401 });
    await expect(postStep('username')).rejects.toMatchObject({ statusCode: 401 });
    await expect(postComplete()).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('onboarding at account creation', () => {
  it('marks a self-registered password account as pending', async () => {
    const { default: handler } = await import('../../../layers/auth-password/server/api/auth/register-password.post');
    const password = 'ValidPassword1!';
    const result = await handler(createEvent('/api/auth/register-password', 'POST', {}, {
      username: 'self_signup', name: 'New Member', email: 'signup@example.test', password,
      'confirm-password': password, 'cf-turnstile-response': 'test-token',
    }));

    expect(result).toBe('/auth/login?redirectTo=%2F');
    expect(await userService.getByUsername('self_signup')).toMatchObject({ onboardingPending: true });
  });

  it.each([{}, { onboardingPending: true, onboardingCompletedSteps: ['preferences'] }])(
    'does not put admin-created users in onboarding with extra input %j', async (extra) => {
      await import('../../../layers/auth-password/server/plugins/password-sign-in');
      const { default: handler } = await import('../../../layers/admin-users/server/api/admin/users/index.post');
      await handler(createEvent('/api/admin/users', 'POST', {}, {
        username: 'admin_created', name: 'Managed User', email: 'managed@example.test',
        password: 'ValidPassword1!', ...extra,
      }));

      expect(await userService.getByUsername('admin_created')).toMatchObject({
        onboardingPending: false, onboardingCompletedSteps: [],
      });
    },
  );

  it('does not let general admin user updates overwrite onboarding progress', async () => {
    const { default: handler } = await import('../../../layers/admin-users/server/api/admin/users/[id]/index.put');
    await handler(createEvent('/api/admin/users/1', 'PUT', { id: '1' }, {
      id: 1, name: 'Renamed Member', onboardingPending: false, onboardingCompletedSteps: ['preferences'],
    }));

    expect(await userService.getById(1)).toMatchObject({
      name: 'Renamed Member', onboardingPending: true, onboardingCompletedSteps: [],
    });
  });

  it('does not create an onboarding or password identity when seeding', async () => {
    const { seedDatabase } = await import('../../../layers/admin/server/utils/database/seed');
    await expect(seedDatabase()).resolves.toEqual({ summary: {}, tasks: [] });

    expect(await db.select({ id: users.id }).from(users)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(await db.select().from(userPasswords)).toEqual([]);
  });
});
