import { describe, expect, it, vi } from 'vitest';
import { authenticatePasskey } from '#layers/auth-passkeys/app/utils/authenticatePasskey';
import {
  chooseLastSignInView,
  forgetLastSignIn,
  LAST_SIGN_IN_KEY,
  readLastSignIn,
  saveCachedSignInAvatar,
  syncLastSignIn,
} from '#layers/auth/app/utils/lastSignIn';
import { lastSignInSchema } from '#layers/auth/shared/schemas/lastSignInSchema';
import type { LastSignInSession, LastSignInStorage, LastSignInViewOptions } from '#layers/auth/types/lastSignIn';

const avatarUrl = 'https://example.test/image.png';
const cachedAvatar = 'data:image/webp;base64,YQ==';
const passwordRecord = {
  method: 'password',
  username: 'member',
  name: 'Member Name',
  avatar: null,
  avatarUrl: null,
  savedAt: 42,
} as const;
const oauthRecord = { ...passwordRecord, method: 'oauth', provider: 'google' } as const;

function createStorage(): LastSignInStorage {
  const records = new Map<string, string>();
  return {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => { records.set(key, value); },
    removeItem: (key) => { records.delete(key); },
  };
}

const passwordSession = {
  user: { username: 'member', name: 'Member Name' },
  loginMethod: 'password',
  loginProvider: '',
  loginMethodAt: 42,
} satisfies LastSignInSession;

const viewOptions = {
  mounted: true,
  mode: 'auto',
  hasMessage: false,
  hasStep: false,
  record: passwordRecord,
  providerStatus: 'success',
  providerEnabled: true,
  passkeyAvailable: true,
} satisfies LastSignInViewOptions;

function choose(options: Partial<LastSignInViewOptions>) {
  return chooseLastSignInView({ ...viewOptions, ...options });
}

describe('last sign-in storage', () => {
  it('accepts password, passkey, and provider records with local or remote avatars', () => {
    expect(lastSignInSchema.safeParse(passwordRecord).success).toBe(true);
    expect(lastSignInSchema.safeParse({ ...passwordRecord, method: 'passkey', avatar: avatarUrl, avatarUrl }).success).toBe(true);
    expect(lastSignInSchema.safeParse({ ...oauthRecord, avatar: cachedAvatar, avatarUrl }).success).toBe(true);
  });

  it.each([
    '',
    '{',
    JSON.stringify({ method: 'password', username: 'member' }),
    JSON.stringify({ ...oauthRecord, provider: undefined }),
    JSON.stringify({ ...passwordRecord, provider: 'google' }),
    JSON.stringify({ ...passwordRecord, savedAt: -1 }),
    JSON.stringify({ ...passwordRecord, avatar: 'javascript:alert(1)' }),
    JSON.stringify({ ...passwordRecord, password: 'secret' }),
  ])('drops old or invalid data %s', (raw) => {
    const storage = createStorage();
    storage.setItem(LAST_SIGN_IN_KEY, raw);
    expect(readLastSignIn(storage)).toBeNull();
    expect(storage.getItem(LAST_SIGN_IN_KEY)).toBeNull();
  });

  it('records only a completed session, not 2FA in progress or a pre-feature session', () => {
    const storage = createStorage();
    const challenge = { secure: { pending2faUserId: 1 } };
    expect(syncLastSignIn(storage, null)).toBeNull();
    expect(syncLastSignIn(storage, { ...challenge, user: null })).toBeNull();
    expect(syncLastSignIn(storage, { user: passwordSession.user })).toBeNull();
    expect(readLastSignIn(storage)).toBeNull();

    expect(syncLastSignIn(storage, passwordSession)).toEqual(passwordRecord);
    expect(syncLastSignIn(storage, null)).toBeNull();
    expect(readLastSignIn(storage)).toEqual(passwordRecord);
  });

  it('refreshes the name and URL for an authenticated user, preserving a cached copy until the URL changes', () => {
    const storage = createStorage();
    const session = { ...passwordSession, user: { ...passwordSession.user, avatarUrl } };
    const record = syncLastSignIn(storage, session);
    expect(record).toMatchObject({ avatar: avatarUrl });
    if (!record) throw new Error('Expected a remembered record');
    saveCachedSignInAvatar(storage, record, cachedAvatar);

    expect(syncLastSignIn(storage, { ...session, user: { ...session.user, name: 'Updated' } }))
      .toMatchObject({ avatar: cachedAvatar, name: 'Updated', savedAt: record.savedAt });
    expect(syncLastSignIn(storage, { ...session, user: { ...session.user, avatarUrl: '' } }))
      .toMatchObject({ avatar: null, avatarUrl: null, savedAt: record.savedAt });
    saveCachedSignInAvatar(storage, record, cachedAvatar);
    expect(readLastSignIn(storage)?.avatar).toBeNull();
  });

  it('forgets device identity without allowing an old session or in-flight avatar to recreate it', () => {
    const storage = createStorage();
    const record = syncLastSignIn(storage, { ...passwordSession, user: { ...passwordSession.user, avatarUrl } });
    if (!record) throw new Error('Expected a remembered record');
    forgetLastSignIn(storage);
    saveCachedSignInAvatar(storage, record, cachedAvatar);
    expect(syncLastSignIn(storage, passwordSession)).toBeNull();
    expect(readLastSignIn(storage)).toBeNull();

    expect(syncLastSignIn(storage, { ...passwordSession, loginMethodAt: 43 })).toMatchObject({ savedAt: 43 });
    expect(syncLastSignIn(storage, passwordSession)).toBeNull();
    expect(readLastSignIn(storage)?.savedAt).toBe(43);
  });
});

describe('last sign-in view', () => {
  it('holds a neutral placeholder for hydration and while the remembered OAuth provider loads', () => {
    expect(choose({ mounted: false, record: null })).toBe('placeholder');
    expect(choose({ record: oauthRecord, providerStatus: 'idle', providerEnabled: false })).toBe('placeholder');
    expect(choose({ record: oauthRecord, providerStatus: 'pending', providerEnabled: false })).toBe('placeholder');
    expect(choose({ record: oauthRecord })).toBe('tile');
  });

  it('uses the full form for a step, a notice, or an unavailable method', () => {
    expect(choose({})).toBe('tile');
    expect(choose({ hasStep: true })).toBe('form');
    expect(choose({ mounted: false, hasMessage: true })).toBe('form');
    expect(choose({ mode: 'form' })).toBe('form');
    expect(choose({ mode: 'password' })).toBe('form');
    expect(choose({ record: null })).toBe('form');
    expect(choose({ record: oauthRecord, providerEnabled: false })).toBe('form');
    expect(choose({ record: { ...passwordRecord, method: 'passkey' }, passkeyAvailable: false })).toBe('form');
  });
});

describe('passkey continuation', () => {
  it.each([false, undefined])('does not treat %s as a successful verification', async (verified) => {
    const authenticate = vi.fn(async () => verified);
    expect(await authenticatePasskey(' member ', authenticate)).toBe(false);
    expect(authenticate).toHaveBeenCalledWith('member');
  });

  it('accepts explicit verification and lets errors fall through to the login error handler', async () => {
    expect(await authenticatePasskey('member', async () => true)).toBe(true);
    await expect(authenticatePasskey('member', async () => { throw new Error('cancelled'); })).rejects.toThrow('cancelled');
  });
});
