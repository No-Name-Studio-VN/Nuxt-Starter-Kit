import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { createError, type RequestEvent } from 'nuxt/server';
import { afterEach, expect, it, vi } from 'vitest';
import { credentials } from '../../../layers/auth-passkeys/server/db/schema.sqlite';
import { success } from '../../../layers/server-core/server/utils/apiResponse';

vi.mock('../../../layers/kv/server/utils/kv', () => ({ useKV: vi.fn() }));
const { completeSignIn } = vi.hoisted(() => ({ completeSignIn: vi.fn() }));
vi.mock('../../../layers/auth/server/utils/completeSignIn', () => ({ completeSignIn }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('shows the last successful sign-in only on the passkey that authenticated', async () => {
  const client = createClient({ url: ':memory:' });
  try {
    await client.execute(`
      CREATE TABLE credentials (
        id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, public_key TEXT NOT NULL,
        counter INTEGER NOT NULL, backed_up INTEGER NOT NULL, transports TEXT NOT NULL,
        name TEXT, last_used_at INTEGER, created_at INTEGER, updated_at INTEGER
      )
    `);
    const db = drizzle(client);
    await db.insert(credentials).values(['used', 'unused'].map((id) => ({
      id,
      userId: 1,
      publicKey: 'public-key',
      counter: 0,
      backedUp: false,
      transports: ['internal'],
    })));
    const user = { id: 1 };
    const defineAuthenticateHandler = vi.fn((options: unknown) => options);
    vi.stubGlobal('defineWebAuthnAuthenticateEventHandler', defineAuthenticateHandler);
    vi.stubGlobal('defineEventHandler', (handler: (event: RequestEvent) => Promise<unknown>) => handler);
    vi.stubGlobal('requireUserSession', async () => ({ user }));
    vi.stubGlobal('success', success);
    vi.stubGlobal('createError', createError);
    vi.stubGlobal('tables', { credentials });
    vi.stubGlobal('useDB', () => db);
    await import('../../../layers/auth-passkeys/server/api/webauthn/authenticate.post');
    const { default: listPasskeys } = await import('../../../layers/auth-passkeys/server/api/users/[id]/passkeys/index.get');
    const options = defineAuthenticateHandler.mock.calls[0]?.[0];
    if (!options || typeof options !== 'object' || !('onSuccess' in options) || typeof options.onSuccess !== 'function') {
      throw new Error('Missing successful authentication callback');
    }

    const url = new URL('https://example.test/api/users/1/passkeys');
    const event = { url, req: new Request(url), res: { headers: new Headers() }, context: {} };
    await expect(listPasskeys(event)).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'used', lastUsedAt: null }),
        expect.objectContaining({ id: 'unused', lastUsedAt: null }),
      ]),
    });

    const lastUsedAt = new Date('2026-11-20T13:00:00Z');
    vi.setSystemTime(lastUsedAt);
    const authenticated = { credential: { id: 'used', user } };
    completeSignIn.mockResolvedValueOnce({
      kind: 'deny',
      error: { status: 403, message: 'Sign-in denied', code: 'TEST_SIGN_IN_DENIED' },
    });
    await expect(options.onSuccess(event, authenticated)).rejects.toMatchObject({
      status: 403, data: { error: { code: 'TEST_SIGN_IN_DENIED' } },
    });
    await expect(listPasskeys(event)).resolves.toMatchObject({
      data: expect.arrayContaining([expect.objectContaining({ id: 'used', lastUsedAt: null })]),
    });

    completeSignIn.mockResolvedValueOnce({ kind: 'continue' });
    await options.onSuccess(event, authenticated);

    const response = await listPasskeys(event);
    expect(response).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'used', lastUsedAt }),
        expect.objectContaining({ id: 'unused', lastUsedAt: null }),
      ]),
    });
  } finally {
    client.close();
  }
});
