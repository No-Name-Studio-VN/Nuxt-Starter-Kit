import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import type { RequestEvent } from 'nuxt/server';
import { getRouterParam } from 'nuxt/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../../layers/auth/server/db/schema.sqlite';
import { oauthAccounts } from '../../../layers/auth-oauth/server/db/schema.sqlite';
import { authTokens, userPasswords } from '../../../layers/auth-password/server/db/schema.sqlite';
import { AuthTokenType } from '../../../layers/auth-password/shared/constants/authTokens';
import { EmailVerificationTokenType } from '../../../layers/auth-email-verification/shared/constants/emailVerificationTokens';
import { emailFieldSchema } from '../../../shared/schemas/common';

vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));
const { sendVerificationEmail } = vi.hoisted(() => ({ sendVerificationEmail: vi.fn(async () => {}) }));
vi.mock('../../../layers/auth-email-verification/server/utils/verificationEmail', () => ({
  sendVerificationEmail,
}));

const { sendPasswordResetEmail } = vi.hoisted(() => ({ sendPasswordResetEmail: vi.fn(async () => {}) }));
vi.mock('../../../layers/auth-password/server/utils/passwordResetEmail', () => ({
  sendPasswordResetEmail,
}));

const client = createClient({ url: ':memory:' });
const db = drizzle(client);
const password = 'ValidPassword1!';
const originalPasswordDate = new Date('2026-10-20T12:00:00Z');

async function getPassword(userId = 1) {
  return db.select().from(userPasswords).where(eq(userPasswords.userId, userId)).get();
}

async function expectNewCredential(userId: number | undefined) {
  if (userId === undefined) throw new Error('Missing user for password credential');
  expect(await getPassword(userId)).toMatchObject({ passwordHash: 'password-hash', updatedAt: expect.any(Date) });
}
let body: unknown;
let userService: typeof import('../../../layers/auth/server/utils/database/user').default;
const defineHandler = vi.fn((handler: (event: RequestEvent) => Promise<unknown>) => handler);

function createSession() {
  return {
    id: 'session-id',
    user: { id: 1, name: 'John', username: 'john', isAdmin: false, onboardingPending: false, skipLockOnInit: true },
    loggedInAt: new Date('2026-11-20T12:00:00Z'),
    secure: { marker: 'keep' },
  };
}

let session: ReturnType<typeof createSession>;
const setSession = vi.fn(async (_event: RequestEvent, data: Pick<typeof session, 'user'>) => {
  session = { ...session, user: { ...session.user, ...data.user } };
  return session;
});

function createRequestEvent(id = '1') {
  const url = new URL('https://example.com');
  const event = {
    url,
    req: new Request(url),
    res: { headers: new Headers() },
    context: { params: { id } },
    waitUntil: vi.fn(),
  };
  return event;
}

function callHandler(event: RequestEvent) {
  const handler = defineHandler.mock.lastCall?.[0];
  if (!handler) throw new Error('Route handler not registered');
  return handler(event);
}

async function patchProfile(event = createRequestEvent()) {
  await import('../../../layers/auth/server/api/users/[id]/profile.patch');
  return callHandler(event);
}

async function register(email: string) {
  body = {
    username: 'new-member',
    email,
    name: 'New Member',
    password,
    'confirm-password': password,
  };
  await import('../../../layers/auth-password/server/api/auth/register-password.post');
  return callHandler(createRequestEvent());
}

beforeEach(async () => {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS oauth_accounts;
    DROP TABLE IF EXISTS auth_tokens;
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
    CREATE TABLE auth_tokens (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE, type TEXT NOT NULL, email TEXT, expires_at INTEGER NOT NULL,
      used_at INTEGER, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE oauth_accounts (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL, provider_account_id TEXT NOT NULL, email TEXT, name TEXT,
      avatar_url TEXT, created_at INTEGER, updated_at INTEGER,
      UNIQUE (provider, provider_account_id), UNIQUE (user_id, provider)
    );
  `);
  await db.insert(users).values([
    { id: 1, username: 'john', name: 'John', email: 'John@x.com', emailVerified: true },
    { id: 2, username: 'other', name: 'Other', email: 'Other@x.com' },
  ]);
  body = { name: 'John Updated', email: 'new@x.com', currentPassword: password };
  vi.resetModules();
  ({ default: userService } = await import('../../../layers/auth/server/utils/database/user'));
  vi.stubGlobal('tables', { users, authTokens, oauthAccounts, userPasswords });
  vi.stubGlobal('useDB', () => db);
  session = createSession();
  setSession.mockClear();
  vi.stubGlobal('getRouterParam', getRouterParam);
  vi.stubGlobal('getUserSession', async () => session);
  vi.stubGlobal('requireUserSession', async () => session);
  vi.stubGlobal('setUserSession', setSession);
  defineHandler.mockClear();
  vi.stubGlobal('defineEventHandler', defineHandler);
  vi.stubGlobal('defineNitroPlugin', (registerPlugin: () => void) => registerPlugin());
  vi.stubGlobal('readValidatedBody', async (_event: RequestEvent, validate: (input: unknown) => unknown) => validate(body));
  vi.stubGlobal('createError', (options: object) => Object.assign(new Error('API error'), options));
  vi.stubGlobal('getRequestURL', (event: RequestEvent) => event.url);
  vi.stubGlobal('getQuery', (event: RequestEvent) => Object.fromEntries(event.url.searchParams));
  vi.stubGlobal('sendRedirect', (_event: RequestEvent, location: string) => location);
  vi.stubGlobal('hashPassword', vi.fn(async () => 'password-hash'));
  vi.stubGlobal('verifyPassword', async (hash: string, input: string) => hash === 'hash' && input === password);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sendVerificationEmail.mockClear();
  sendPasswordResetEmail.mockClear();
  await db.insert(userPasswords).values([1, 2].map((userId) => ({ userId, passwordHash: 'hash', updatedAt: originalPasswordDate })));
  await import('../../../layers/auth-password/server/plugins/password-sign-in');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => client.close());

async function seedTokens() {
  const expiresAt = new Date(Date.now() + 3_600_000);
  await db.insert(authTokens).values([
    { userId: 1, token: 'reset', type: 'password_reset', expiresAt },
    { userId: 1, token: 'verification', type: 'email_verification', expiresAt },
    { userId: 1, token: 'used-reset', type: 'password_reset', expiresAt, usedAt: new Date() },
    { userId: 1, token: 'unrelated-kind', type: 'custom', expiresAt },
    { userId: 2, token: 'other-reset', type: 'password_reset', expiresAt },
  ]);
}

async function tokenNames() {
  return (await db.select({ token: authTokens.token }).from(authTokens).orderBy(authTokens.token))
    .map(({ token }) => token);
}

describe('email normalization', () => {
  it('trims and lowercases an email before validating it', () => {
    expect(emailFieldSchema().parse('  John@X.com ')).toBe('john@x.com');
  });

  it('preserves the caller’s validation message', () => {
    const result = emailFieldSchema('custom.email_error').safeParse('invalid');
    expect(result.error?.issues[0]?.message).toBe('custom.email_error');
  });

  it('finds a mixed-case legacy email', async () => {
    expect(await userService.getByEmail('JOHN@x.com')).toMatchObject({ id: 1, email: 'John@x.com' });
  });

  it('lists all matches for a legacy case-duplicate', async () => {
    await db.insert(users).values({ username: 'duplicate', name: 'Duplicate', email: 'john@x.com' });
    const matches = await userService.listByEmail('JOHN@x.com');
    expect(matches.map(({ email }) => email).sort()).toEqual(['John@x.com', 'john@x.com']);
  });
});

describe('profile session updates', () => {
  it('refreshes the signed-in user’s display name while preserving the rest of the session', async () => {
    const previous = session;
    body = { name: 'John Updated', email: 'John@x.com' };

    await patchProfile();

    expect(session).toEqual({ ...previous, user: { ...previous.user, name: 'John Updated' } });
  });

  it('leaves the admin’s session unchanged when editing another user', async () => {
    await userService.update({ id: 1, isAdmin: true });
    session.user.isAdmin = true;
    const previous = session;
    body = { name: 'Other Updated', email: 'Other@x.com' };

    await patchProfile(createRequestEvent('2'));

    expect(await userService.getById(2)).toMatchObject({ name: 'Other Updated' });
    expect(session).toEqual(previous);
    expect(setSession).not.toHaveBeenCalled();
  });
});

describe('profile email changes', () => {
  it('rejects an email change for an account without a password', async () => {
    await db.delete(userPasswords).where(eq(userPasswords.userId, 1));

    await expect(patchProfile()).rejects.toMatchObject({
      status: 403,
      data: { error: { code: 'EMAIL_CHANGE_REQUIRES_PASSWORD' } },
    });
    expect(await userService.getById(1)).toMatchObject({ name: 'John', email: 'John@x.com', emailVerified: true });
  });

  it.each([
    ['missing', {}],
    ['empty', { currentPassword: '' }],
    ['incorrect', { currentPassword: 'incorrect' }],
  ])('rejects an email change when the current password is %s', async (_kind, credentials) => {
    body = { name: 'John Updated', email: 'new@x.com', ...credentials };

    await expect(patchProfile()).rejects.toMatchObject({
      status: 401,
      data: {
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          fieldErrors: { currentPassword: ['validation.current_password_incorrect'] },
        },
      },
    });
    expect(await userService.getById(1)).toMatchObject({ name: 'John', email: 'John@x.com', emailVerified: true });
  });

  it('saves a name change without a password on an account without a password', async () => {
    await db.delete(userPasswords).where(eq(userPasswords.userId, 1));
    body = { name: 'John Updated', email: 'John@x.com' };

    await expect(patchProfile()).resolves.toMatchObject({ data: { name: 'John Updated', email: 'John@x.com' } });
  });

  it('stores a normalized changed email and clears verification with the correct current password', async () => {
    body = { name: 'John Updated', email: '  New@X.com ', currentPassword: password };
    await expect(patchProfile()).resolves.toMatchObject({ data: { name: 'John Updated', email: 'new@x.com' } });
    expect(await userService.getById(1)).toMatchObject({ name: 'John Updated', email: 'new@x.com', emailVerified: false });
  });

  it('deletes only the user’s outstanding email-bound tokens', async () => {
    await seedTokens();
    await patchProfile();
    expect(await tokenNames()).toEqual(['other-reset', 'unrelated-kind', 'used-reset']);
  });

  it('does not save a new address if token deletion fails', async () => {
    await seedTokens();
    await client.execute(`
      CREATE TRIGGER fail_token_deletion BEFORE DELETE ON auth_tokens
      BEGIN SELECT RAISE(ABORT, 'token deletion failed'); END
    `);
    await expect(patchProfile()).rejects.toThrow();
    expect(await userService.getById(1)).toMatchObject({ email: 'John@x.com', emailVerified: true });
  });

  it('runs registered hooks once for the saved email with the exact previous address', async () => {
    const { registerEmailChangedHook } = await import('../../../layers/auth/server/utils/emailChangedHooks');
    const late = vi.fn(async () => {});
    const early = vi.fn(async () => {});
    registerEmailChangedHook({ id: 'late', order: 200, run: late });
    registerEmailChangedHook({ id: 'early', order: 100, run: early });
    expect(() => registerEmailChangedHook({ id: 'early', order: 300, run: late })).toThrow(/already registered/);

    const event = createRequestEvent();
    await patchProfile(event);
    expect(early).toHaveBeenCalledExactlyOnceWith({
      event,
      user: expect.objectContaining({ id: 1, email: 'new@x.com', emailVerified: false }),
      previousEmail: 'John@x.com',
    });
    expect(late).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledBefore(late);
  });

  it('preserves verification and tokens and skips hooks when only email case changes', async () => {
    await seedTokens();
    const { registerEmailChangedHook } = await import('../../../layers/auth/server/utils/emailChangedHooks');
    const run = vi.fn(async () => {});
    registerEmailChangedHook({ id: 'test-email-change', order: 100, run });

    body = { name: 'John Updated', email: 'JOHN@x.com' };
    await patchProfile();
    expect(await userService.getById(1)).toMatchObject({ name: 'John Updated', email: 'John@x.com', emailVerified: true });
    expect(await tokenNames()).toEqual(['other-reset', 'reset', 'unrelated-kind', 'used-reset', 'verification']);
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects an email taken by another user in a different case', async () => {
    body = { name: 'John Updated', email: 'other@x.com', currentPassword: password };
    await expect(patchProfile()).rejects.toMatchObject({
      status: 409,
      data: { error: { code: 'EMAIL_ALREADY_IN_USE' } },
    });
    expect(await userService.getById(1)).toMatchObject({ email: 'John@x.com', emailVerified: true });
  });

  it('returns a conflict if another user claims the email before the profile write', async () => {
    const { default: routeUserService } = await import('../../../layers/auth/server/utils/database/user');
    vi.spyOn(routeUserService, 'listByEmail').mockImplementationOnce(async () => {
      await userService.update({ id: 2, email: 'new@x.com' });
      return [];
    });

    await expect(patchProfile()).rejects.toMatchObject({
      status: 409,
      data: { error: { code: 'EMAIL_ALREADY_IN_USE' } },
    });
    expect(await userService.getById(1)).toMatchObject({ email: 'John@x.com', emailVerified: true });
  });

  it('sends a fresh verification token to the new address when the layer is installed', async () => {
    await seedTokens();
    await import('../../../layers/auth-email-verification/server/plugins/email-verification');
    await patchProfile();

    const tokens = await db.select().from(authTokens).where(eq(authTokens.type, 'email_verification'));
    expect(tokens).toHaveLength(1);
    const [freshToken] = tokens;
    expect(freshToken).toMatchObject({ userId: 1, email: 'new@x.com', usedAt: null });
    expect(freshToken?.token).not.toBe('verification');
    expect(sendVerificationEmail).toHaveBeenCalledExactlyOnceWith('new@x.com', 'john', freshToken?.token);
  });

  it('keeps a verification token bound to the address supplied to a superseded hook', async () => {
    const { registerEmailChangedHook } = await import('../../../layers/auth/server/utils/emailChangedHooks');
    const { default: usersForHook } = await import('../../../layers/auth/server/utils/database/user');
    registerEmailChangedHook({
      id: 'supersede-address',
      order: 50,
      async run({ user }) {
        await usersForHook.updateEmail(user.id, 'newer@x.com', { name: user.name });
      },
    });
    await import('../../../layers/auth-email-verification/server/plugins/email-verification');

    await patchProfile();

    expect(await tokenNames()).toEqual([]);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(await userService.getById(1)).toMatchObject({ email: 'newer@x.com', emailVerified: false });
  });

  it('keeps a saved profile update successful if the optional layer cannot mint a token', async () => {
    await import('../../../layers/auth-email-verification/server/plugins/email-verification');
    await client.execute(`
      CREATE TRIGGER fail_token_creation BEFORE INSERT ON auth_tokens
      BEGIN SELECT RAISE(ABORT, 'token creation failed'); END
    `);

    await expect(patchProfile()).resolves.toMatchObject({ data: { email: 'new@x.com' } });
    expect(await userService.getById(1)).toMatchObject({ emailVerified: false });
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('password registration', () => {
  it('refuses a mixed-case legacy duplicate before hashing', async () => {
    await expect(register('john@x.com')).resolves.toBe('/auth/register?error=email-existed');
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('stores a new address trimmed and lowercased', async () => {
    await expect(register('  Fresh@X.com ')).resolves.toBe('/auth/login?redirectTo=%2F');
    const user = await userService.getByUsername('new-member');
    expect(user).toMatchObject({ email: 'fresh@x.com' });
    await expectNewCredential(user?.id);
  });
});

async function updateAdminUser(event = createRequestEvent()) {
  await import('../../../layers/admin-users/server/api/admin/users/[id]/index.put');
  return callHandler(event);
}

describe('admin password changes', () => {
  it('records the initial password when an admin creates a user', async () => {
    body = { username: 'admin-created', email: 'created@example.test', name: 'Created Member', password };
    await import('../../../layers/admin-users/server/api/admin/users/index.post');

    await expect(callHandler(createRequestEvent())).resolves.toMatchObject({ success: true });
    await expectNewCredential((await userService.getByUsername('admin-created'))?.id);
  });

  it('records the password change when an admin leaves the email unchanged', async () => {
    body = { id: 1, password };
    await expect(updateAdminUser()).resolves.toMatchObject({ success: true });
    await expectNewCredential(1);
  });
});

describe('admin email changes', () => {
  it('ignores submitted verification, deletes old tokens and runs the hook with the saved user', async () => {
    await seedTokens();
    const { registerEmailChangedHook } = await import('../../../layers/auth/server/utils/emailChangedHooks');
    const run = vi.fn(async () => {});
    registerEmailChangedHook({ id: 'test-admin-email-change', order: 100, run });
    const event = createRequestEvent();
    body = { id: 1, name: 'John Updated', email: '  New@X.com ', emailVerified: true, isAdmin: true, password };

    await expect(updateAdminUser(event)).resolves.toMatchObject({
      data: { user: { email: 'new@x.com', emailVerified: false, isAdmin: true, name: 'John Updated' } },
    });
    await expectNewCredential(1);
    expect(await tokenNames()).toEqual(['other-reset', 'unrelated-kind', 'used-reset']);
    expect(run).toHaveBeenCalledExactlyOnceWith({
      event,
      user: expect.objectContaining({ id: 1, email: 'new@x.com', emailVerified: false }),
      previousEmail: 'John@x.com',
    });
  });

  it('rejects a case-insensitive duplicate without changing verification or tokens', async () => {
    await seedTokens();
    body = { id: 1, email: 'other@x.com', emailVerified: false };
    await expect(updateAdminUser()).rejects.toMatchObject({
      status: 409,
      data: { error: { code: 'EMAIL_ALREADY_IN_USE' } },
    });
    expect(await userService.getById(1)).toMatchObject({ email: 'John@x.com', emailVerified: true });
    expect(await tokenNames()).toEqual(['other-reset', 'reset', 'unrelated-kind', 'used-reset', 'verification']);
  });

  it('allows explicit verification edits without resetting tokens or calling hooks if email is unchanged', async () => {
    await seedTokens();
    const { registerEmailChangedHook } = await import('../../../layers/auth/server/utils/emailChangedHooks');
    const run = vi.fn(async () => {});
    registerEmailChangedHook({ id: 'unchanged-admin-email', order: 100, run });
    body = { id: 1, email: '  JOHN@x.com ', emailVerified: false };
    await expect(updateAdminUser()).resolves.toMatchObject({
      data: { user: { email: 'John@x.com', emailVerified: false } },
    });
    expect(await getPassword()).toMatchObject({ passwordHash: 'hash', updatedAt: originalPasswordDate });
    expect(await tokenNames()).toEqual(['other-reset', 'reset', 'unrelated-kind', 'used-reset', 'verification']);
    expect(run).not.toHaveBeenCalled();
  });

  it('applies an explicit email and verification edit without an optimistic email check', async () => {
    vi.stubGlobal('hashPassword', async () => {
      await userService.updateEmail(1, 'new@x.com', {});
      return 'password-hash';
    });
    body = { id: 1, email: 'explicit@x.com', emailVerified: true, password };

    await expect(updateAdminUser()).resolves.toMatchObject({
      data: { user: { email: 'explicit@x.com', emailVerified: false } },
    });
  });

  it('returns a conflict if another user claims the email before the admin write', async () => {
    vi.stubGlobal('hashPassword', async () => {
      await userService.update({ id: 2, email: 'new@x.com' });
      return 'password-hash';
    });
    body = { id: 1, email: 'new@x.com', emailVerified: true, password };

    await expect(updateAdminUser()).rejects.toMatchObject({
      status: 409,
      data: { error: { code: 'EMAIL_ALREADY_IN_USE' } },
    });
    expect(await userService.getById(1)).toMatchObject({ email: 'John@x.com', emailVerified: true });
  });
});

async function loadEmailBoundFlow(type: AuthTokenType | EmailVerificationTokenType) {
  const { default: authTokenService } = await import('../../../layers/auth-password/server/utils/database/authToken');
  const isReset = type === AuthTokenType.PasswordReset;
  const sendEmail = isReset ? sendPasswordResetEmail : sendVerificationEmail;
  if (isReset) {
    await import('../../../layers/auth-password/server/plugins/auth-tokens');
  } else {
    await import('../../../layers/auth-email-verification/server/plugins/email-verification');
  }

  return {
    authTokenService,
    sendEmail,
    async issue() {
      body = { email: 'john@x.com' };
      if (isReset) {
        await import('../../../layers/auth-password/server/api/auth/forgot-password.post');
      } else {
        await import('../../../layers/auth-email-verification/server/api/auth/resend-verification.post');
      }
      return callHandler(createRequestEvent());
    },
    async redeem(token: string) {
      const event = createRequestEvent();
      if (isReset) {
        body = { token, password, confirmPassword: password };
        await import('../../../layers/auth-password/server/api/auth/reset-password.post');
      } else {
        event.url.searchParams.set('token', token);
        await import('../../../layers/auth-email-verification/server/api/auth/verify-email.get');
      }
      return callHandler(event);
    },
  };
}

async function issuedToken(type: AuthTokenType | EmailVerificationTokenType) {
  const record = await db.select().from(authTokens).where(eq(authTokens.type, type)).get();
  if (!record) throw new Error('Expected an issued token');
  return record;
}

describe.each([AuthTokenType.PasswordReset, EmailVerificationTokenType.EmailVerification])('%s token redemption', (type) => {
  const isReset = type === AuthTokenType.PasswordReset;
  const invalid = { status: 400, data: { error: { code: 'RESET_TOKEN_INVALID' } } };
  const invalidRedirect = '/auth/login?error=invalid-token';
  const verifiedRedirect = '/auth/login?success=email-verified';

  beforeEach(async () => {
    await userService.update({ id: 1, emailVerified: false });
  });

  it('rejects a token bound to the snapshot address when the address changes before issuance', async () => {
    const flow = await loadEmailBoundFlow(type);
    vi.spyOn(flow.authTokenService, 'hasRecentToken').mockImplementationOnce(async () => {
      await userService.updateEmail(1, 'new@x.com', {});
      return false;
    });

    await expect(flow.issue()).resolves.toMatchObject({ success: true });
    expect(await tokenNames()).toEqual([]);
    expect(flow.sendEmail).not.toHaveBeenCalled();
    expect(await userService.getById(1)).toMatchObject({ email: 'new@x.com', emailVerified: false });
    expect(await getPassword()).toMatchObject({ passwordHash: 'hash', updatedAt: originalPasswordDate });
  });

  it('rejects a legacy token without a bound email', async () => {
    const flow = await loadEmailBoundFlow(type);
    await db.insert(authTokens).values({
      userId: 1,
      token: 'legacy-token',
      type,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = flow.redeem('legacy-token');
    if (isReset) {
      await expect(result).rejects.toMatchObject(invalid);
    } else {
      await expect(result).resolves.toBe(invalidRedirect);
    }
    expect(await userService.getById(1)).toMatchObject({ emailVerified: false });
    expect(await getPassword()).toMatchObject({ passwordHash: 'hash', updatedAt: originalPasswordDate });
    expect((await issuedToken(type)).usedAt).toBeNull();
  });

  it('issues a token for the current mailbox and verifies it only once', async () => {
    const flow = await loadEmailBoundFlow(type);
    await flow.issue();
    const { token, email } = await issuedToken(type);
    expect(email).toBe('john@x.com');
    expect(flow.sendEmail).toHaveBeenCalledExactlyOnceWith('John@x.com', 'john', token);
    const expiresAt = new Date(Date.now() + 60_000);
    await db.insert(authTokens).values([
      { userId: 1, token: 'sibling-verification', type: EmailVerificationTokenType.EmailVerification, expiresAt },
      { userId: 1, token: 'sibling-reset', type: AuthTokenType.PasswordReset, expiresAt },
    ]);

    const result = flow.redeem(token);
    if (isReset) {
      await expect(result).resolves.toMatchObject({ success: true });
      await expect(flow.redeem(token)).rejects.toMatchObject(invalid);
    } else {
      await expect(result).resolves.toBe(verifiedRedirect);
      await expect(flow.redeem(token)).resolves.toBe(invalidRedirect);
    }
    expect(await userService.getById(1)).toMatchObject({ emailVerified: true });
    const tokens = await db.select().from(authTokens);
    expect(tokens.find((record) => record.token === token)?.usedAt).toBeInstanceOf(Date);
    expect(tokens.find((record) => record.token === 'sibling-verification')?.usedAt).toBeInstanceOf(Date);
    const siblingReset = tokens.find((record) => record.token === 'sibling-reset');
    if (isReset) {
      expect(siblingReset?.usedAt).toBeInstanceOf(Date);
    } else {
      expect(siblingReset?.usedAt).toBeNull();
    }
  });

  it.each([false, true])('rejects a token after an email change (after initial validation: %s)', async (afterValidation) => {
    const flow = await loadEmailBoundFlow(type);
    await flow.issue();
    const { token } = await issuedToken(type);
    if (afterValidation) {
      const verify = flow.authTokenService.verifyToken.bind(flow.authTokenService);
      vi.spyOn(flow.authTokenService, 'verifyToken').mockImplementationOnce(async (...args) => {
        const record = await verify(...args);
        expect(record).not.toBeNull();
        await userService.updateEmail(1, 'new@x.com', {});
        return record;
      });
    } else {
      await userService.updateEmail(1, 'new@x.com', {});
    }

    const result = flow.redeem(token);
    if (isReset) {
      await expect(result).rejects.toMatchObject(invalid);
    } else {
      await expect(result).resolves.toBe(invalidRedirect);
    }
    expect(await userService.getById(1)).toMatchObject({ email: 'new@x.com', emailVerified: false });
    expect(await getPassword()).toMatchObject({ passwordHash: 'hash', updatedAt: originalPasswordDate });
    expect(await tokenNames()).toEqual([]);
  });

  it('rejects a token after a saved email changes even if its row remains', async () => {
    const flow = await loadEmailBoundFlow(type);
    await flow.issue();
    const { token } = await issuedToken(type);
    await db.update(users).set({ email: 'new@x.com' }).where(eq(users.id, 1));

    const result = flow.redeem(token);
    if (isReset) {
      await expect(result).rejects.toMatchObject(invalid);
    } else {
      await expect(result).resolves.toBe(invalidRedirect);
    }
    expect(await userService.getById(1)).toMatchObject({ email: 'new@x.com', emailVerified: false });
    expect(await getPassword()).toMatchObject({ passwordHash: 'hash', updatedAt: originalPasswordDate });
    expect((await issuedToken(type)).usedAt).toBeNull();
  });

  it('only lets one of two concurrent requests redeem the same token', async () => {
    const flow = await loadEmailBoundFlow(type);
    await flow.issue();
    const { token } = await issuedToken(type);
    const verify = flow.authTokenService.verifyToken.bind(flow.authTokenService);
    const bothChecked = Promise.withResolvers<void>();
    let checks = 0;
    vi.spyOn(flow.authTokenService, 'verifyToken').mockImplementation(async (...args) => {
      const record = await verify(...args);
      if (++checks === 2) bothChecked.resolve();
      await bothChecked.promise;
      expect(record).not.toBeNull();
      return record;
    });

    const results = await Promise.allSettled([flow.redeem(token), flow.redeem(token)]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    if (isReset) {
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(fulfilled[0]?.value).toMatchObject({ success: true });
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject(invalid);
    } else {
      expect(fulfilled.map(({ value }) => value)).toEqual(expect.arrayContaining([verifiedRedirect, invalidRedirect]));
    }
    expect(await userService.getById(1)).toMatchObject({ emailVerified: true });
    expect((await issuedToken(type)).usedAt).toBeInstanceOf(Date);
  });
});

describe('OAuth links on password reset', () => {
  beforeEach(async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ public: {} }));
    await import('../../../layers/auth-oauth/server/plugins/oauth-sign-in');
    await db.insert(oauthAccounts).values([
      { userId: 1, provider: 'google', providerAccountId: '1' },
      { userId: 1, provider: 'github', providerAccountId: '2' },
      { userId: 2, provider: 'google', providerAccountId: '3' },
    ]);
  });

  it.each([false, true])('only disconnects links when the reset verifies the mailbox (verified before: %s)', async (emailVerified) => {
    await userService.update({ id: 1, emailVerified });
    const flow = await loadEmailBoundFlow(AuthTokenType.PasswordReset);
    await flow.issue();
    const { token } = await issuedToken(AuthTokenType.PasswordReset);

    await expect(flow.redeem(token)).resolves.toMatchObject({
      data: { oauthAccountsDisconnected: !emailVerified },
    });
    expect(await userService.getById(1)).toMatchObject({
      emailVerified: true,
    });
    await expectNewCredential(1);
    const links = await db.select().from(oauthAccounts).orderBy(oauthAccounts.id);
    expect(links.map(({ providerAccountId }) => providerAccountId)).toEqual(emailVerified ? ['1', '2', '3'] : ['3']);
  });

  it('rolls back the password, verification and disconnections if consuming the token fails', async () => {
    await userService.update({ id: 1, emailVerified: false });
    const flow = await loadEmailBoundFlow(AuthTokenType.PasswordReset);
    await flow.issue();
    const { token } = await issuedToken(AuthTokenType.PasswordReset);
    await client.execute(`
      CREATE TRIGGER fail_token_consumption BEFORE UPDATE OF used_at ON auth_tokens
      WHEN NEW.used_at IS NOT NULL
      BEGIN SELECT RAISE(ABORT, 'token consumption failed'); END
    `);

    await expect(flow.redeem(token)).rejects.toThrow();
    expect(await userService.getById(1)).toMatchObject({
      emailVerified: false,
    });
    expect(await getPassword()).toMatchObject({ passwordHash: 'hash', updatedAt: originalPasswordDate });
    expect(await db.select().from(oauthAccounts)).toHaveLength(3);
    expect((await issuedToken(AuthTokenType.PasswordReset)).usedAt).toBeNull();
  });
});
