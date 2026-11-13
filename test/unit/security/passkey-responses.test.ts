import { afterEach, describe, expect, it, vi } from 'vitest';
import userService from '../../../layers/auth/server/utils/database/user';
import { getClientSafeWebAuthnResponse } from '../../../layers/auth-passkeys/server/utils/webauthnResponse';

vi.mock('../../../layers/auth/server/utils/database/user', () => ({
  default: { getByUsername: vi.fn() },
}));
vi.mock('../../../layers/server-core/server/utils/kv', () => ({ useKV: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('client-safe WebAuthn responses', () => {
  it('limits known-user descriptors and keeps unknown-user credentials empty', async () => {
    const captureHandler = vi.fn((options: unknown) => options);
    const id = 'credential-id';
    const transports = ['internal'];
    const where = vi.fn().mockResolvedValue([{ id, transports }]);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const credentials = { id: 'id', transports: 'transports', userId: 'userId' };
    vi.stubGlobal('defineWebAuthnAuthenticateEventHandler', captureHandler);
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
    vi.stubGlobal('useDB', () => ({ select }));
    vi.stubGlobal('tables', { credentials });
    await import('../../../layers/auth-passkeys/server/api/webauthn/authenticate.post');
    const options = captureHandler.mock.calls[0]?.[0];
    if (
      options === null ||
      typeof options !== 'object' ||
      !('allowCredentials' in options) ||
      typeof options.allowCredentials !== 'function'
    ) {
      throw new Error('Missing allowCredentials callback');
    }

    vi.mocked(userService.getByUsername).mockResolvedValue({
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
    expect(await options.allowCredentials({}, 'member')).toEqual([{ id, transports }]);
    expect(select).toHaveBeenCalledWith({ id: credentials.id, transports: credentials.transports });

    select.mockClear();
    vi.mocked(userService.getByUsername).mockResolvedValue(undefined);
    expect(await options.allowCredentials({}, 'unknown')).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it('preserves creation and authentication options, including an empty credential list', () => {
    for (const options of [
      { creationOptions: { challenge: 'register', excludeCredentials: [] }, attemptId: 'one' },
      {
        requestOptions: {
          challenge: 'authenticate',
          allowCredentials: [{ id: 'credential-id', transports: ['internal'] }],
        },
        attemptId: 'two',
      },
      { requestOptions: { challenge: 'unknown', allowCredentials: [] }, attemptId: 'three' },
    ]) {
      expect(getClientSafeWebAuthnResponse(options)).toBe(options);
    }
  });

  it('returns only verified after registration, excluding even the encoded attestation', () => {
    expect(
      getClientSafeWebAuthnResponse({
        verified: true,
        registrationInfo: {
          credential: { id: 'credential-id', publicKey: new Uint8Array([1, 2]), counter: 0 },
          attestationObject: new Uint8Array([3, 4]),
        },
      }),
    ).toEqual({ verified: true });
  });

  it('does not expose the authentication signature counter', () => {
    expect(
      getClientSafeWebAuthnResponse({
        verified: true,
        authenticationInfo: { credentialID: 'credential-id', newCounter: 1 },
      }),
    ).toEqual({ verified: true });
    expect(getClientSafeWebAuthnResponse({ verified: false })).toEqual({ verified: false });
  });
});
