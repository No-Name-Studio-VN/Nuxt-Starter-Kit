import type { SignInRequestEvent } from '#layers/auth/types/loginPolicies';
import type { SessionUser, User } from '#layers/auth/types/auth';
import type { SignInEvidence, SessionPresentation } from '#layers/auth/types/signInMethods';
import { signInAvatarUrlSchema, signInIdentifierSchema } from '#layers/auth/shared/schemas/lastSignInSchema';
import { MAX_USER_NAME_LENGTH, MAX_USERNAME_LENGTH } from '#layers/auth/shared/schemas/userSchema';
import { getSignInMethod } from '#layers/auth/server/utils/signInMethods';

export function toSessionUser(user: User, extra?: Pick<SessionUser, 'skipLockOnInit' | 'avatarUrl'>): SessionUser {
  const sessionUser: SessionUser = {
    id: user.id,
    username: user.username.slice(0, MAX_USERNAME_LENGTH),
    name: user.name.slice(0, MAX_USER_NAME_LENGTH),
    isAdmin: user.isAdmin,
    onboardingPending: user.onboardingPending,
    ...extra,
  };
  // JSON escaping and multibyte URLs can exceed the cookie budget despite character limits.
  // Reserve space for sign-in metadata, encryption, base64 and cookie attributes.
  if (sessionUser.avatarUrl && (!signInAvatarUrlSchema.safeParse(sessionUser.avatarUrl).success ||
    new TextEncoder().encode(JSON.stringify(sessionUser)).byteLength > 2400)) {
    sessionUser.avatarUrl = '';
  }
  return sessionUser;
}

async function resolveSessionPresentation(evidence: SignInEvidence): Promise<SessionPresentation> {
  try {
    return await getSignInMethod('oauth')?.resolveSessionPresentation?.(evidence) ?? {};
  } catch {
    // A profile picture is optional and must never block a verified sign-in.
    return {};
  }
}

export async function setCompletedSignIn(event: SignInRequestEvent, user: User, evidence: SignInEvidence) {
  const { avatarUrl, provider } = await resolveSessionPresentation(evidence);
  const signedInAt = Date.now();
  // Session writes merge data; clear previous display metadata with explicit scalars.
  await setUserSession(event, {
    user: toSessionUser(user, {
      skipLockOnInit: true,
      avatarUrl: avatarUrl ?? '',
    }),
    signedInAt,
    loginMethod: signInIdentifierSchema.safeParse(evidence.method).data ?? '',
    loginProvider: signInIdentifierSchema.safeParse(provider).data ?? '',
    loginMethodAt: signedInAt,
  });
}

export async function refreshSessionUser(event: SignInRequestEvent, user: User, sessionUser?: SessionUser) {
  const currentUser = sessionUser ?? (await getUserSession(event)).user;
  if (currentUser && Number(currentUser.id) === user.id) {
    // Merge only the profile; the absolute sign-in timestamp stays unchanged.
    await setUserSession(event, {
      user: toSessionUser(user, { skipLockOnInit: currentUser.skipLockOnInit, avatarUrl: currentUser.avatarUrl }),
    });
  }
}
