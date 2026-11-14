import { createRequire } from 'node:module';
import type * as H3 from 'h3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userService from '../../../layers/auth/server/utils/database/user';

// Use Nitro's H3 version: the test utilities can depend on a different major version.
const nuxtRequire = createRequire(import.meta.resolve('nuxt'));
const nitroRequire = createRequire(nuxtRequire.resolve('@nuxt/nitro-server'));
const h3: typeof H3 = await import(
  createRequire(nitroRequire.resolve('nitropack/package.json')).resolve('h3')
);
const {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getHeader,
  getRequestURL,
  toWebHandler,
} = h3;

vi.mock('../../../layers/auth/server/utils/database/user', () => ({
  default: { getById: vi.fn() },
}));
vi.mock('../../../layers/server-core/server/utils/reportServerError', () => ({
  reportServerError: vi.fn(),
}));

const config = {
  seed: { secret: 'test-seed-secret' },
  defaultAdminPassword: 'test-admin-password',
};
const summary = { admin: { created: true, verified: true, username: 'admin' } };
const seedDatabase = vi.fn().mockResolvedValue({ summary, tasks: [] });
const requireUserSession = vi.fn(async () => {
  throw createError({ status: 401, statusText: 'Unauthorized' });
});

async function request(path = '/api/admin/seed', headers: HeadersInit = {}, method = 'POST') {
  const { default: adminGuard } = await import('../../../layers/admin/server/middleware/admin');
  const { default: seed } = await import('../../../layers/admin/server/api/admin/seed.post');
  const router = createRouter();
  router.post('/api/admin/seed', seed);
  const app = createApp();
  app.use(adminGuard);
  app.use(router);
  return toWebHandler(app)(new Request(new URL(path, 'http://localhost'), { method, headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
  config.seed.secret = 'test-seed-secret';
  config.defaultAdminPassword = 'test-admin-password';
  vi.stubGlobal('defineEventHandler', defineEventHandler);
  vi.stubGlobal('createError', createError);
  vi.stubGlobal('getHeader', getHeader);
  vi.stubGlobal('getRequestURL', getRequestURL);
  vi.stubGlobal('useRuntimeConfig', () => config);
  vi.stubGlobal('seedDatabase', seedDatabase);
  vi.stubGlobal('requireUserSession', requireUserSession);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/admin/seed bootstrap authentication', () => {
  it.each<HeadersInit>([
    {},
    { 'x-seed-secret': 'wrong-secret' },
    { authorization: 'Bearer wrong-secret' },
    { authorization: 'Basic test-seed-secret' },
  ])('rejects missing or invalid seed credentials: %j', async (headers) => {
    const response = await request('/api/admin/seed', headers);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      data: { success: false, error: { code: 'INVALID_SEED_SECRET' } },
    });
    expect(seedDatabase).not.toHaveBeenCalled();
    expect(requireUserSession).not.toHaveBeenCalled();
    expect(userService.getById).not.toHaveBeenCalled();
  });

  it.each<HeadersInit>([
    { 'x-seed-secret': 'test-seed-secret' },
    { authorization: 'Bearer test-seed-secret' },
  ])('allows bootstrap with a valid secret and no existing admin session: %j', async (headers) => {
    const response = await request('/api/admin/seed', headers);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: summary,
      message: 'Database seed completed.',
    });
    expect(seedDatabase).toHaveBeenCalledExactlyOnceWith('test-admin-password');
    expect(requireUserSession).not.toHaveBeenCalled();
    expect(userService.getById).not.toHaveBeenCalled();
  });

  it('uses the pathname for the exact route when a query string is present', async () => {
    const response = await request('/api/admin/seed?bootstrap=1', {
      'x-seed-secret': 'test-seed-secret',
    });
    expect(response.status).toBe(200);
    expect(seedDatabase).toHaveBeenCalledOnce();
    expect(requireUserSession).not.toHaveBeenCalled();
  });

  it('does not fall back to a correct bearer token when x-seed-secret is wrong', async () => {
    const response = await request('/api/admin/seed', {
      'x-seed-secret': 'wrong-secret',
      authorization: 'Bearer test-seed-secret',
    });
    expect(response.status).toBe(401);
    expect(seedDatabase).not.toHaveBeenCalled();
  });

  it.each<HeadersInit>([{}, { 'x-seed-secret': 'test-seed-secret' }])(
    'disables the endpoint when no seed secret is configured: %j',
    async (headers) => {
      config.seed.secret = '';
      const response = await request('/api/admin/seed', headers);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        data: { success: false, error: { code: 'SEED_ENDPOINT_NOT_CONFIGURED' } },
      });
      expect(seedDatabase).not.toHaveBeenCalled();
      expect(requireUserSession).not.toHaveBeenCalled();
    },
  );

  it('requires a configured default admin password before seeding', async () => {
    config.defaultAdminPassword = '';
    const response = await request('/api/admin/seed', { 'x-seed-secret': 'test-seed-secret' });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      data: { success: false, error: { code: 'DEFAULT_ADMIN_PASSWORD_NOT_CONFIGURED' } },
    });
    expect(seedDatabase).not.toHaveBeenCalled();
  });
});

describe('admin guard boundaries', () => {
  it.each([
    ['/api/admin/tasks/seed-admin', 'POST'],
    ['/api/admin/users', 'GET'],
    ['/api/admin/users', 'POST'],
    ['/api/admin/seed/extra', 'POST'],
    ['/api/admin/seed/', 'POST'],
    ['/api/admin/seed', 'GET'],
    ['/api/admin/seed', 'PUT'],
  ])('still requires a session for %s (%s), even with the seed secret', async (path, method) => {
    const response = await request(path, { 'x-seed-secret': 'test-seed-secret' }, method);
    expect(response.status).toBe(401);
    expect(requireUserSession).toHaveBeenCalledOnce();
    expect(userService.getById).not.toHaveBeenCalled();
    expect(seedDatabase).not.toHaveBeenCalled();
  });

  it('still requires administrator privileges for other admin endpoints', async () => {
    vi.stubGlobal('requireUserSession', async () => ({ user: { id: 1 } }));
    vi.mocked(userService.getById).mockResolvedValue({
      id: 1,
      username: 'member',
      name: 'Member',
      password: 'internal-hash',
      email: 'member@example.com',
      emailVerified: true,
      isAdmin: false,
      isLocked: false,
      lastLoginAt: null,
      createdAt: null,
      updatedAt: null,
    });
    const response = await request(
      '/api/admin/users',
      { 'x-seed-secret': 'test-seed-secret' },
      'GET',
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      data: { success: false, error: { code: 'ADMIN_REQUIRED' } },
    });
    expect(userService.getById).toHaveBeenCalledExactlyOnceWith(1);
    expect(seedDatabase).not.toHaveBeenCalled();
  });

  it('does not exempt the old nonexistent path for a non-admin session', async () => {
    vi.stubGlobal('requireUserSession', async () => ({ user: { id: 1 } }));
    vi.mocked(userService.getById).mockResolvedValue({
      id: 1,
      username: 'member',
      name: 'Member',
      password: 'internal-hash',
      email: 'member@example.com',
      emailVerified: true,
      isAdmin: false,
      isLocked: false,
      lastLoginAt: null,
      createdAt: null,
      updatedAt: null,
    });
    const response = await request('/api/admin/tasks/seed-admin', {
      'x-seed-secret': 'test-seed-secret',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      data: { success: false, error: { code: 'ADMIN_REQUIRED' } },
    });
    expect(seedDatabase).not.toHaveBeenCalled();
  });
});
