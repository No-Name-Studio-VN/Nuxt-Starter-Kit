import { lastSignInSchema, signInAvatarUrlSchema } from '#layers/auth/shared/schemas/lastSignInSchema';
import type {
  LastSignIn,
  LastSignInSession,
  LastSignInStorage,
  LastSignInView,
  LastSignInViewOptions,
} from '#layers/auth/types/lastSignIn';

export const LAST_SIGN_IN_KEY = 'auth:last-sign-in';
const FORGOTTEN_SIGN_IN_KEY = 'auth:forgotten-sign-in-at';

export function getLastSignInStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readLastSignIn(storage?: LastSignInStorage): LastSignIn | null {
  try {
    const raw = storage?.getItem(LAST_SIGN_IN_KEY);
    if (raw === null || raw === undefined) return null;
    const parsed = lastSignInSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // An old, malformed, or inaccessible entry is not a remembered account.
  }

  try {
    storage?.removeItem(LAST_SIGN_IN_KEY);
  } catch {
    // Sign-in remains usable if storage is blocked.
  }
  return null;
}

export function forgetLastSignIn(storage?: LastSignInStorage) {
  const record = readLastSignIn(storage);
  try {
    // A still-open tab with this session must not recreate the forgotten record.
    if (record) storage?.setItem(FORGOTTEN_SIGN_IN_KEY, String(record.savedAt));
  } catch {
    // Deletion still matters if the marker could not be written.
  }
  try {
    storage?.removeItem(LAST_SIGN_IN_KEY);
  } catch {
    // Sign-in remains usable if storage is blocked.
  }
}

export function syncLastSignIn(storage: LastSignInStorage | undefined, session: LastSignInSession | null) {
  if (!storage || !session?.user) return null;
  const { username, name, avatarUrl } = session.user;
  const source = signInAvatarUrlSchema.safeParse(avatarUrl).data ?? null;
  const previous = readLastSignIn(storage);
  const account = {
    username,
    name: name.trim() || username,
    avatar: previous?.avatarUrl === source ? previous.avatar : source,
    avatarUrl: source,
    savedAt: session.loginMethodAt,
  };
  const record = lastSignInSchema.safeParse(session.loginMethod === 'oauth'
    ? { ...account, method: session.loginMethod, provider: session.loginProvider }
    : { ...account, method: session.loginMethod });
  if (!record.success) return null;

  const next = record.data;
  try {
    if (next.savedAt <= Number(storage.getItem(FORGOTTEN_SIGN_IN_KEY))) return null;
    if (previous && previous.savedAt > next.savedAt) return null;
    const serialized = JSON.stringify(next);
    if (serialized !== JSON.stringify(previous)) storage.setItem(LAST_SIGN_IN_KEY, serialized);
    return next;
  } catch {
    return null;
  }
}

export function saveCachedSignInAvatar(storage: LastSignInStorage, record: LastSignIn, avatar: string) {
  try {
    // Do not restore a forgotten account or overwrite a newer sign-in while the image loads.
    const current = readLastSignIn(storage);
    if (current?.savedAt !== record.savedAt || current.avatarUrl !== record.avatarUrl) return;
    const next = lastSignInSchema.safeParse({ ...current, avatar });
    if (next.success) storage.setItem(LAST_SIGN_IN_KEY, JSON.stringify(next.data));
  } catch {
    // The original URL is already stored if caching is unavailable.
  }
}

export function chooseLastSignInView(options: LastSignInViewOptions): LastSignInView {
  const { mounted, hasStep, hasMessage, mode, record, providerStatus, providerEnabled, passkeyAvailable } = options;
  if (hasStep || hasMessage || mode !== 'auto') return 'form';
  if (!mounted) return 'placeholder';
  if (!record) return 'form';
  if (record.method === 'oauth') {
    if (providerStatus === 'idle' || providerStatus === 'pending') return 'placeholder';
    return providerEnabled ? 'tile' : 'form';
  }
  if (record.method === 'passkey' && !passkeyAvailable) return 'form';
  return 'tile';
}
