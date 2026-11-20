import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { users, userLockScreen } from '../../../layers/auth/server/db/schema.sqlite';
import { userTwoFactor } from '../../../layers/auth-2fa/server/db/schema.sqlite';
import { userPasswords } from '../../../layers/auth-password/server/db/schema.sqlite';
import userTwoFactorService from '../../../layers/auth-2fa/server/utils/database/userTwoFactor';
import {
  loginTwoFactorSchema,
  twoFactorVerifyFormSchema,
  validateTotpSchema,
  verifyTotpSchema,
} from '../../../layers/auth-2fa/shared/schemas/twoFactorSchema';

vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));
vi.mock('../../../layers/auth/server/utils/authorization', () => ({
  getAuthorizedUserId: async () => 1,
}));

const client = createClient({ url: ':memory:' });
const db = drizzle(client);
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const originalEnabledAt = new Date('2026-10-21T10:00:00.000Z');
const setResponseHeader = vi.fn();
const verifyPassword = vi.fn(async (hash: string, password: string) => hash === `hashed:${password}`);
let body: { code: string } | { password: string } = { code: '' };

const event = { context: {} };
const defineHandler = vi.fn((handler: (event: object) => Promise<object>) => () => handler(event));

beforeEach(async () => {
  // RFC 6238 SHA-1 vector at 59 seconds: the six-digit token is 287082.
  vi.spyOn(Date, 'now').mockReturnValue(59_000);
  await client.executeMultiple(`
    DROP TABLE IF EXISTS user_two_factor;
    DROP TABLE IF EXISTS user_lock_screen;
    DROP TABLE IF EXISTS user_passwords;
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL, email_verified INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0, is_locked INTEGER DEFAULT 0,
      onboarding_pending INTEGER NOT NULL DEFAULT 0,
      onboarding_completed_steps TEXT NOT NULL DEFAULT '[]',
      last_login_at INTEGER, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE user_two_factor (
      user_id INTEGER PRIMARY KEY, secret TEXT, enabled INTEGER NOT NULL DEFAULT 0,
      backup_codes TEXT, created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE user_lock_screen (
      user_id INTEGER PRIMARY KEY, lock_timeout INTEGER NOT NULL DEFAULT 0,
      show_message INTEGER NOT NULL DEFAULT 0, custom_message TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0, last_failed_attempt INTEGER,
      last_activity_time INTEGER, created_at INTEGER, updated_at INTEGER
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
    onboardingPending: true,
  });
  await db.insert(userPasswords).values({ userId: 1, passwordHash: 'hashed:Secret#123' });
  await db.insert(userTwoFactor).values({
    userId: 1,
    secret,
    enabled: true,
    backupCodes: ['AB12CD34', 'EF56GH78'],
    updatedAt: originalEnabledAt,
  });
  await db.insert(userLockScreen).values({ userId: 1 });
  vi.stubGlobal('tables', { users, userTwoFactor, userLockScreen, userPasswords });
  vi.stubGlobal('requireUserSession', async () => ({ user: { id: 1, username: 'member' } }));
  vi.stubGlobal('useDB', () => db);
  vi.resetModules();
  defineHandler.mockClear();
  setResponseHeader.mockClear();
  verifyPassword.mockClear();
  vi.stubGlobal('defineEventHandler', defineHandler);
  vi.stubGlobal('setResponseHeader', setResponseHeader);
  vi.stubGlobal('verifyPassword', verifyPassword);
  vi.stubGlobal(
    'readValidatedBody',
    async (_event: object, validate: (input: unknown) => unknown) => validate(body),
  );
  vi.stubGlobal('getUserSession', async () => ({ secure: { pending2faUserId: 1 } }));
  vi.stubGlobal('setUserSession', vi.fn());
  vi.stubGlobal('useNitroApp', () => ({ hooks: { callHook: async () => {} } }));
  vi.stubGlobal('createError', (options: object) => Object.assign(new Error('API error'), options));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => client.close());

it('generates ten unique exact-format backup codes even when Math.random returns zero', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  await userTwoFactorService.update({ userId: 1, enabled: false, backupCodes: null });
  body = { code: '287082' };
  await import('../../../layers/auth-2fa/server/api/users/[id]/2fa/verify.post');
  const handler = defineHandler.mock.results[0]?.value;
  if (!handler) throw new Error('Missing setup verification handler');
  expect(await handler()).toMatchObject({ success: true });
  const enabled = await userTwoFactorService.getById(1);
  expect(enabled).toMatchObject({ enabled: true, updatedAt: expect.any(Date) });
  expect(enabled?.updatedAt).not.toEqual(originalEnabledAt);
  const codes = enabled?.backupCodes;
  expect(codes).toHaveLength(10);
  expect(new Set(codes).size).toBe(10);
  for (const code of codes ?? []) {
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(loginTwoFactorSchema.safeParse({ code }).success).toBe(true);
  }
});

describe('2FA setup and disable check the password', () => {
  async function load(route: 'setup.post' | 'disable.delete') {
    await import(`../../../layers/auth-2fa/server/api/users/[id]/2fa/${route}.ts`);
    const handler = defineHandler.mock.results[0]?.value;
    if (!handler) throw new Error(`Missing ${route} handler`);
    return handler;
  }

  it('disables 2FA only with the account password', async () => {
    const disable = await load('disable.delete');
    body = { password: 'Wrong#123' };
    await expect(disable()).rejects.toMatchObject({
      status: 401,
      data: { error: { code: 'INVALID_PASSWORD' } },
    });
    expect((await userTwoFactorService.getById(1))?.enabled).toBe(true);

    body = { password: 'Secret#123' };
    expect(await disable()).toMatchObject({ success: true });
    expect((await userTwoFactorService.getById(1))?.enabled).toBe(false);
  });

  it('refuses setup for an account without a password', async () => {
    await userTwoFactorService.update({ userId: 1, enabled: false });
    await db.delete(userPasswords);
    const setup = await load('setup.post');
    body = { password: 'Secret#123' };
    await expect(setup()).rejects.toMatchObject({
      status: 401,
      data: { error: { code: 'INVALID_PASSWORD' } },
    });
  });

  it('starts setup with the account password', async () => {
    await userTwoFactorService.update({ userId: 1, enabled: false });
    const setup = await load('setup.post');
    body = { password: 'Secret#123' };
    expect(await setup()).toMatchObject({ success: true, data: { uri: expect.any(String) } });
  });
});

it('keeps a newly started setup undated until verification succeeds', async () => {
  await userTwoFactorService.delete(1);
  expect(await userTwoFactorService.startSetup(1, secret)).toBe(true);
  expect(await userTwoFactorService.getById(1)).toMatchObject({ enabled: false, updatedAt: null });
});

it('does not enable a stale setup or reissue codes from verification after enablement', async () => {
  await userTwoFactorService.update({ userId: 1, enabled: false, backupCodes: null });
  expect(await userTwoFactorService.startSetup(1, 'NEW_SECRET')).toBe(true);
  expect((await userTwoFactorService.getById(1))?.updatedAt).toEqual(originalEnabledAt);
  expect(await userTwoFactorService.enable(1, secret, ['23456789'], new Date())).toBe(false);
  await userTwoFactorService.update({ userId: 1, secret, enabled: true, backupCodes: ['AB12CD34'] });
  expect(await userTwoFactorService.startSetup(1, 'NEW_SECRET')).toBe(false);
  body = { code: '287082' };
  await import('../../../layers/auth-2fa/server/api/users/[id]/2fa/verify.post');
  const handler = defineHandler.mock.results[0]?.value;
  if (!handler) throw new Error('Missing setup verification handler');
  await expect(handler()).rejects.toMatchObject({
    status: 400,
    data: { error: { code: 'TWO_FACTOR_ALREADY_ENABLED' } },
  });
  expect(await userTwoFactorService.getById(1)).toMatchObject({
    secret,
    updatedAt: originalEnabledAt,
    backupCodes: ['AB12CD34'],
  });
});

describe('backup-code regeneration', () => {
  async function regenerate(password: string) {
    body = { password };
    await import('../../../layers/auth-2fa/server/api/users/[id]/2fa/backup-codes.post');
    const handler = defineHandler.mock.results[0]?.value;
    if (!handler) throw new Error('Missing backup-code regeneration handler');
    return handler();
  }

  it('requires a password', async () => {
    await expect(regenerate('')).rejects.toMatchObject({
      status: 400,
      data: { error: { code: 'VALIDATION_ERROR' } },
    });
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('does not replace codes with an incorrect password', async () => {
    await expect(regenerate('wrong-password')).rejects.toMatchObject({
      status: 401,
      data: { error: { code: 'INVALID_PASSWORD' } },
    });
    expect((await userTwoFactorService.getById(1))?.backupCodes).toEqual(['AB12CD34', 'EF56GH78']);
  });

  it('does not issue codes for disabled 2FA even with the correct password', async () => {
    await userTwoFactorService.update({ userId: 1, enabled: false, backupCodes: null });
    await expect(regenerate('Secret#123')).rejects.toMatchObject({
      status: 400,
      data: { error: { code: 'TWO_FACTOR_NOT_ENABLED' } },
    });
    expect((await userTwoFactorService.getById(1))?.backupCodes).toBeNull();
  });

  it('returns the persisted replacement once, invalidates the previous codes, and preserves the enable date', async () => {
    await expect(userTwoFactorService.consumeBackupCode(1, 'AB12CD34')).resolves.toBe(true);
    const response = await regenerate('Secret#123');
    const updated = await userTwoFactorService.getById(1);
    expect(updated?.backupCodes).toHaveLength(10);
    expect(response).toHaveProperty('data', { backupCodes: updated?.backupCodes });
    expect(updated?.secret).toBe(secret);
    expect(updated?.updatedAt).toEqual(originalEnabledAt);
    expect(setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store');
    await expect(userTwoFactorService.consumeBackupCode(1, 'EF56GH78')).resolves.toBe(false);
    const code = updated?.backupCodes?.[0];
    if (!code) throw new Error('Missing regenerated backup code');
    await expect(userTwoFactorService.consumeBackupCode(1, code)).resolves.toBe(true);
    await expect(userTwoFactorService.consumeBackupCode(1, code)).resolves.toBe(false);
  });

  it.each([{ backupCodes: [] }, { backupCodes: null }])('regenerates even when no codes remain ($backupCodes)', async ({ backupCodes }) => {
    await userTwoFactorService.update({ userId: 1, backupCodes });
    await expect(regenerate('Secret#123')).resolves.toMatchObject({ success: true });
    expect((await userTwoFactorService.getById(1))?.backupCodes).toHaveLength(10);
  });

  it('does not overwrite a newer batch or a disabled account using an old snapshot', async () => {
    const previous = ['AB12CD34', 'EF56GH78'];
    expect(await userTwoFactorService.replaceBackupCodes(1, secret, previous, ['NEWCODE1'])).toBe(true);
    expect(await userTwoFactorService.replaceBackupCodes(1, secret, previous, ['NEWCODE2'])).toBe(false);
    expect((await userTwoFactorService.getById(1))?.backupCodes).toEqual(['NEWCODE1']);
    await userTwoFactorService.update({ userId: 1, enabled: false });
    expect(await userTwoFactorService.replaceBackupCodes(1, secret, ['NEWCODE1'], ['NEWCODE2'])).toBe(false);
  });
});

it('disables 2FA and clears its codes without moving the enable timestamp', async () => {
  body = { password: 'Secret#123' };
  await import('../../../layers/auth-2fa/server/api/users/[id]/2fa/disable.delete');
  const handler = defineHandler.mock.results[0]?.value;
  if (!handler) throw new Error('Missing 2FA disable handler');
  expect(await handler()).toHaveProperty('success', true);
  expect(await userTwoFactorService.getById(1)).toMatchObject({
    enabled: false,
    secret: null,
    backupCodes: null,
    updatedAt: originalEnabledAt,
  });
});

describe('two-factor code schemas', () => {
  it.each([loginTwoFactorSchema, validateTotpSchema])(
    'accepts authenticator and exact generated backup formats',
    (schema) => {
      expect(schema.safeParse({ code: '012345' }).success).toBe(true);
      expect(schema.safeParse({ code: 'AB12CD34' }).success).toBe(true);
      expect(schema.safeParse({ code: '12345678' }).success).toBe(true);
      for (const code of [
        '',
        'ABC123',
        '12345',
        '1234567',
        'AB12CD345',
        'ab12cd34',
        'AB12-CD3',
        ' AB12CD34',
        'AB12CD34\n',
      ]) {
        expect(schema.safeParse({ code }).success, JSON.stringify(code)).toBe(false);
      }
    },
  );

  it('keeps setup verification strictly six ASCII digits', () => {
    expect(verifyTotpSchema.safeParse({ code: '012345' }).success).toBe(true);
    expect(twoFactorVerifyFormSchema.safeParse({ verificationCode: '012345' }).success).toBe(true);
    for (const code of ['ABC123', 'AB12CD34', '12345', '1234567', '１２３４５６', '12345\n']) {
      expect(verifyTotpSchema.safeParse({ code }).success).toBe(false);
      expect(twoFactorVerifyFormSchema.safeParse({ verificationCode: code }).success).toBe(false);
    }
  });
});

it('allows only one concurrent redemption across login and unlock', async () => {
  body = { code: 'AB12CD34' };
  await import('../../../layers/auth-2fa/server/api/auth/login-2fa.post');
  const login = defineHandler.mock.results[0]?.value;
  await import('../../../layers/auth-2fa/server/api/users/[id]/lock-screen/validate.post');
  const unlock = defineHandler.mock.results[1]?.value;
  if (!login || !unlock) throw new Error('Missing verification handlers');
  const results = await Promise.allSettled([login(), unlock()]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect((await userTwoFactorService.getById(1))?.backupCodes).toEqual(['EF56GH78']);
});

describe('atomic backup-code consumption', () => {
  it('preserves concurrent redemptions of different codes without restoring either', async () => {
    expect(
      await Promise.all([
        userTwoFactorService.consumeBackupCode(1, 'AB12CD34'),
        userTwoFactorService.consumeBackupCode(1, 'EF56GH78'),
      ]),
    ).toEqual([true, true]);
    expect((await userTwoFactorService.getById(1))?.backupCodes).toEqual([]);
    expect(await userTwoFactorService.consumeBackupCode(1, 'AB12CD34')).toBe(false);
  });

  it("never consumes another account's code or a disabled account's code", async () => {
    expect(await userTwoFactorService.consumeBackupCode(2, 'AB12CD34')).toBe(false);
    await userTwoFactorService.update({ userId: 1, enabled: false });
    expect(await userTwoFactorService.consumeBackupCode(1, 'AB12CD34')).toBe(false);
    expect((await userTwoFactorService.getById(1))?.backupCodes).toEqual(['AB12CD34', 'EF56GH78']);
  });
});

for (const route of ['login', 'unlock']) {
  describe(`${route} verification`, () => {
    async function verify(code: string) {
      body = { code };
      if (route === 'login') {
        await import('../../../layers/auth-2fa/server/api/auth/login-2fa.post');
      } else {
        await import('../../../layers/auth-2fa/server/api/users/[id]/lock-screen/validate.post');
      }
      const handler = defineHandler.mock.results[0]?.value;
      if (!handler) throw new Error('Missing two-factor handler');
      return handler();
    }

    it('accepts a backup code once, rejects replay and preserves the other codes', async () => {
      expect(await verify('AB12CD34')).toMatchObject({ success: true, data: { valid: true } });
      if (route === 'login') {
        expect((await db.select().from(users).get())?.lastLoginAt).toBeInstanceOf(Date);
        expect(setUserSession).toHaveBeenCalledOnce();
        expect(setUserSession).toHaveBeenCalledWith(
          event,
          {
            user: {
              id: 1,
              username: 'member',
              name: 'Member',
              isAdmin: false,
              onboardingPending: true,
              skipLockOnInit: true,
              avatarUrl: '',
            },
            loginMethod: 'password',
            loginProvider: '',
            signedInAt: 59_000,
            loginMethodAt: 59_000,
          },
        );
      }
      expect((await userTwoFactorService.getById(1))?.backupCodes).toEqual(['EF56GH78']);
      await expect(verify('AB12CD34')).rejects.toMatchObject({
        status: 401,
        data: { error: { code: 'INVALID_TWO_FACTOR_CODE' } },
      });
      if (route === 'login') expect(setUserSession).toHaveBeenCalledOnce();
      expect((await db.select().from(userLockScreen).get())?.failedAttempts).toBe(1);
    });

    it('treats an eight-digit numeric code as a single-use backup, not a TOTP', async () => {
      await userTwoFactorService.update({ userId: 1, backupCodes: ['12345678'] });
      expect(await verify('12345678')).toMatchObject({ success: true, data: { valid: true } });
      expect((await userTwoFactorService.getById(1))?.backupCodes).toEqual([]);
      await expect(verify('12345678')).rejects.toMatchObject({ status: 401 });
    });

    it('accepts current TOTP without consuming any backup code', async () => {
      expect(await verify('287082')).toMatchObject({ success: true, data: { valid: true } });
      expect((await userTwoFactorService.getById(1))?.backupCodes).toEqual([
        'AB12CD34',
        'EF56GH78',
      ]);
    });

    it('rejects an incorrect six-digit TOTP and records the failed attempt', async () => {
      await expect(verify('000000')).rejects.toMatchObject({
        status: 401,
        data: { error: { code: 'INVALID_TWO_FACTOR_CODE' } },
      });
      expect((await db.select().from(userLockScreen).get())?.failedAttempts).toBe(1);
      expect((await userTwoFactorService.getById(1))?.backupCodes).toEqual([
        'AB12CD34',
        'EF56GH78',
      ]);
    });

    it('counts an invalid backup toward the shared attempt limit', async () => {
      await db.update(userLockScreen).set({ failedAttempts: 9 });
      await expect(verify('ZZZZZZZZ')).rejects.toMatchObject({ status: 401 });
      await expect(verify('AB12CD34')).rejects.toMatchObject({
        status: 429,
        data: { error: { code: 'TOTP_ATTEMPT_LIMIT_EXCEEDED' } },
      });
      expect((await userTwoFactorService.getById(1))?.backupCodes).toEqual([
        'AB12CD34',
        'EF56GH78',
      ]);
    });

    it('rejects malformed codes before verification', async () => {
      await expect(verify('ABC123')).rejects.toMatchObject({
        status: 400,
        data: { error: { code: 'VALIDATION_ERROR' } },
      });
    });
  });
}
