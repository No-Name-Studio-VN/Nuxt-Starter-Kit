import { clearSession, getCookie, getSession, updateSession } from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';
import type { UserSession } from '#auth-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshSessionUser, setCompletedSignIn, toSessionUser } from '#layers/auth/server/utils/sessionUser';
import { registerSignInMethod } from '#layers/auth/server/utils/signInMethods';
import { createUserSchema, updateProfileSchema, userUpdateSchema } from '#layers/auth/shared/schemas/userSchema';
import { signInAvatarUrlSchema } from '#layers/auth/shared/schemas/lastSignInSchema';
import { registerUserSchema } from '#layers/auth-password/shared/schemas/passwordSchema';
import type { User } from '#layers/auth/types/auth';

const config = { name: 'test-auth-session', maxAge: 30 * 24 * 60 * 60, password: 'test-session-password-32-characters' };
const initialTime = Date.UTC(2026, 10, 21);
const user: User = {
  id: 1, username: 'member', name: 'Member', isAdmin: false, onboardingPending: false,
  onboardingCompletedSteps: [], email: 'member@example.test', emailVerified: true, isLocked: false,
  lastLoginAt: null, createdAt: null, updatedAt: null,
};

function request(previous?: RequestEvent): RequestEvent {
  const url = new URL('https://example.test/api/users/1/profile');
  const cookie = previous?.res.headers.getSetCookie()[0]?.split(';')[0];
  return {
    url,
    req: new Request(url, { headers: cookie ? { cookie } : undefined }),
    res: { headers: new Headers() },
    context: {},
  };
}

async function data(event: RequestEvent) {
  return (await getSession<UserSession>(event, config)).data;
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(initialTime);
  vi.stubGlobal('defineEventHandler', (handler: (event: RequestEvent) => Promise<void>) => handler);
  vi.stubGlobal('useRuntimeConfig', () => ({ session: config }));
  vi.stubGlobal('getCookie', getCookie);
  vi.stubGlobal('getUserSession', data);
  vi.stubGlobal('setUserSession', (event: RequestEvent, patch: Partial<UserSession>) => updateSession(event, config, patch));
  vi.stubGlobal('clearUserSession', (event: RequestEvent) => clearSession(event, config));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('absolute session lifetime', () => {
  it('preserves the sign-in time after a profile refresh, expires at the original deadline, and timestamps a fresh sign-in', async () => {
    const { default: enforceLifetime } = await import('#layers/auth/server/middleware/auth-session');
    const signIn = request();
    await setCompletedSignIn(signIn, user, { user, method: 'password' });
    expect((await data(signIn)).signedInAt).toBe(initialTime);

    const deadline = initialTime + config.maxAge * 1000;
    vi.mocked(Date.now).mockReturnValue(deadline - 1000);
    const refresh = request(signIn);
    await enforceLifetime(refresh);
    expect(refresh.res.headers.getSetCookie()).toEqual([]);
    await refreshSessionUser(refresh, { ...user, name: 'Updated' });
    expect(await data(refresh)).toMatchObject({ signedInAt: initialTime, user: { name: 'Updated', skipLockOnInit: true } });

    vi.mocked(Date.now).mockReturnValue(deadline);
    const expired = request(refresh);
    expect((await data(expired)).user).toBeDefined(); // Resealing extended Nuxt's TTL, not the sign-in deadline.
    await enforceLifetime(expired);
    expect((await data(expired)).user).toBeUndefined();
    expect(expired.res.headers.getSetCookie()).toEqual([expect.stringContaining('Max-Age=0')]);

    await setCompletedSignIn(expired, user, { user, method: 'password' });
    expect(await data(expired)).toMatchObject({ signedInAt: deadline, user: { skipLockOnInit: true } });
  });

  it('clears a legacy authenticated session but leaves an unauthenticated 2FA challenge alone', async () => {
    const { default: enforceLifetime } = await import('#layers/auth/server/middleware/auth-session');
    const legacy = request();
    await updateSession(legacy, config, { user: toSessionUser(user) });
    const expired = request(legacy);
    await enforceLifetime(expired);
    expect(await data(expired)).toEqual({});

    const challenge = request();
    await updateSession(challenge, config, { secure: { pending2faUserId: user.id } });
    const pending = request(challenge);
    await enforceLifetime(pending);
    expect(await data(pending)).toEqual({ secure: { pending2faUserId: user.id } });
    expect(pending.res.headers.getSetCookie()).toEqual([]);
  });
});

describe('session cookie budget', () => {
  it('caps every user-facing name schema at 256 characters', () => {
    const account = { id: user.id, username: user.username, email: user.email };
    for (const schema of [createUserSchema, userUpdateSchema, updateProfileSchema, registerUserSchema]) {
      const profile = { ...account, password: 'SafePass1!', 'confirm-password': 'SafePass1!' };
      expect(schema.safeParse({ ...profile, name: 'a'.repeat(256) }).success).toBe(true);
      expect(schema.safeParse({ ...profile, name: 'a'.repeat(257) }).error?.issues).toContainEqual(expect.objectContaining({
        path: ['name'], message: 'validation.name_max',
      }));
    }
  });

  it('keeps the sealed cookie below 4 KiB even with legacy fields, JSON escaping, and multibyte avatar URLs', async () => {
    const avatar = 'https://example.test/' + '界'.repeat(1024 - 'https://example.test/'.length);
    expect(signInAvatarUrlSchema.safeParse(avatar).success).toBe(true);
    expect(signInAvatarUrlSchema.safeParse(`${avatar}x`).success).toBe(false);
    registerSignInMethod({
      id: 'oauth', countCredentials: async () => 1,
      resolveSessionPresentation: async () => ({ avatarUrl: avatar, provider: 'p'.repeat(64) }),
    });
    const legacy = { ...user, name: '\u0001'.repeat(300), username: 'x'.repeat(75) };
    const event = request();
    await setCompletedSignIn(event, legacy, { user: legacy, method: 'oauth' });
    expect(await data(event)).toMatchObject({ user: { name: '\u0001'.repeat(256), username: 'x'.repeat(50), avatarUrl: '' } });
    expect(event.res.headers.getSetCookie()[0]?.length).toBeLessThan(3600);
  });
});
