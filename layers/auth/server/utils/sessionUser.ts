import type { H3Event } from 'h3';
import type { RequestEvent } from 'nuxt/server';
import type { SessionUser, User } from '#layers/auth/types/auth';
import type { CompletedSignIn } from '#layers/auth/types/lastSignIn';
import { signInAvatarUrlSchema } from '#layers/auth/shared/schemas/lastSignInSchema';
import oauthAccountService from '#layers/auth/server/utils/database/oauthAccount';

export function toSessionUser(user: User, extra?: Pick<SessionUser, 'skipLockOnInit' | 'avatarUrl'>): SessionUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    isAdmin: user.isAdmin,
    onboardingPending: user.onboardingPending,
    ...extra,
  };
}

async function getLinkedAvatar(userId: number) {
  try {
    const accounts = await oauthAccountService.getByUserId(userId);
    return accounts.find((account) => signInAvatarUrlSchema.safeParse(account.avatarUrl).success)?.avatarUrl;
  } catch {
    // A profile picture is optional and must never block a verified sign-in.
    return undefined;
  }
}

export async function setCompletedSignIn(event: H3Event | RequestEvent, user: User, signIn: CompletedSignIn) {
  const avatar = signIn.method === 'oauth' ? signIn.avatarUrl : await getLinkedAvatar(user.id);
  // The session writer merges old data; explicit scalars clear a previous provider or avatar.
  await setUserSession(event, {
    user: toSessionUser(user, {
      skipLockOnInit: signIn.method === 'password',
      avatarUrl: signInAvatarUrlSchema.safeParse(avatar).data ?? '',
    }),
    loginMethod: signIn.method,
    loginProvider: signIn.method === 'oauth' ? signIn.provider : '',
    loginMethodAt: Date.now(),
  });
}

export async function refreshSessionUser(event: H3Event, user: User, sessionUser?: SessionUser) {
  const currentUser = sessionUser ?? (await getUserSession(event)).user;
  if (currentUser && Number(currentUser.id) === user.id) {
    await setUserSession(event, {
      user: toSessionUser(user, { skipLockOnInit: currentUser.skipLockOnInit }),
    });
  }
}
