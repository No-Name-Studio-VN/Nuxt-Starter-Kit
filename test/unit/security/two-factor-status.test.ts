import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getTwoFactor, getUser } = vi.hoisted(() => ({
  getTwoFactor: vi.fn<(userId: number) => Promise<{
    enabled: boolean;
    secret: string;
    backupCodes: string[] | null;
    updatedAt: Date | null;
  } | undefined>>(),
  getUser: vi.fn(async () => ({ id: 7, isAdmin: false })),
}));

vi.mock('../../../layers/auth-2fa/server/utils/database/userTwoFactor', () => ({
  default: { getById: getTwoFactor },
}));
vi.mock('../../../layers/auth/server/utils/database/user', () => ({
  default: { getById: getUser },
}));
vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));

const setResponseHeader = vi.fn();
const defineHandler = vi.fn((handler: (event: object) => Promise<object>) => () => handler({}));
let target = 'me';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  getTwoFactor.mockReset();
  target = 'me';
  vi.stubGlobal('defineEventHandler', defineHandler);
  vi.stubGlobal('requireUserSession', async () => ({ user: { id: 7 } }));
  vi.stubGlobal('getRouterParam', () => target);
  vi.stubGlobal('setResponseHeader', setResponseHeader);
  vi.stubGlobal('createError', (options: object) => Object.assign(new Error('API error'), options));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function getStatus() {
  await import('../../../layers/auth-2fa/server/api/users/[id]/2fa/status.get');
  const handler = defineHandler.mock.results[0]?.value;
  if (!handler) throw new Error('Missing 2FA status handler');
  return handler();
}

describe('GET 2FA status', () => {
  it('reports disabled if setup has not started', async () => {
    expect(await getStatus()).toHaveProperty('data', {
      enabled: false,
      enabledAt: null,
      backupCodesRemaining: 0,
      backupCodesTotal: 0,
    });
    expect(getTwoFactor).toHaveBeenCalledWith(7);
    expect(setResponseHeader).toHaveBeenCalledWith({}, 'Cache-Control', 'private, no-store');
  });

  it('does not expose a pending setup timestamp or codes', async () => {
    getTwoFactor.mockResolvedValue({
      enabled: false,
      secret: 'SECRET',
      backupCodes: ['ABCDEFGH'],
      updatedAt: new Date('2026-11-20T10:00:00.000Z'),
    });
    expect(await getStatus()).toHaveProperty('data', {
      enabled: false,
      enabledAt: null,
      backupCodesRemaining: 0,
      backupCodesTotal: 0,
    });
  });

  it.each([
    { backupCodes: ['ABCDEFGH', 'IJKLMNOP'], remaining: 2 },
    { backupCodes: [], remaining: 0 },
    { backupCodes: null, remaining: 0 },
  ])('counts only unspent codes without returning credentials: $backupCodes', async ({ backupCodes, remaining }) => {
    const updatedAt = new Date('2026-11-20T10:00:00.000Z');
    getTwoFactor.mockResolvedValue({ enabled: true, secret: 'SECRET', backupCodes, updatedAt });
    const response = await getStatus();
    expect(response).toHaveProperty('success', true);
    expect(response).toHaveProperty('data', {
      enabled: true,
      enabledAt: updatedAt.toISOString(),
      backupCodesRemaining: remaining,
      backupCodesTotal: 10,
    });
  });

  it('supports an enabled legacy row with an unknown date', async () => {
    getTwoFactor.mockResolvedValue({ enabled: true, secret: 'SECRET', backupCodes: [], updatedAt: null });
    expect(await getStatus()).toHaveProperty('data.enabledAt', null);
  });

  it('rejects a non-admin request for another user before reading their settings', async () => {
    target = '8';
    await expect(getStatus()).rejects.toMatchObject({
      status: 403,
      data: { error: { code: 'USER_ID_MISMATCH' } },
    });
    expect(getTwoFactor).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request before reading settings', async () => {
    const error = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    vi.stubGlobal('requireUserSession', vi.fn().mockRejectedValue(error));
    await expect(getStatus()).rejects.toBe(error);
    expect(getTwoFactor).not.toHaveBeenCalled();
  });
});
