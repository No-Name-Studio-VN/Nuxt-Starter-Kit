import type { H3Event } from 'h3';
import type { User } from '#layers/auth/types/auth';
import type { LoginPolicyOutcome } from '#layers/auth/types/loginPolicies';
import type { CompleteSignInOptions, SignInEvidence } from '#layers/auth/types/signInMethods';
import userService from '#layers/auth/server/utils/database/user';
import { runLoginPolicies } from '#layers/auth/server/utils/loginPolicies';
import { apiError } from '#layers/server-core/server/utils/apiResponse';

/**
 * Finishes a sign-in whose method has proved who the user is. Runs the login
 * policies for that method and, when they all continue, records the sign-in and
 * writes the session. On `respond` or `deny` nothing is written; the caller
 * answers in its own transport.
 */
export async function completeSignIn(
  event: H3Event,
  user: User,
  { method, redirectTo, ...methodEvidence }: CompleteSignInOptions,
): Promise<LoginPolicyOutcome> {
  const outcome = await runLoginPolicies({ event, user, method, redirectTo });
  if (outcome.kind === 'respond' || outcome.kind === 'deny') {
    return outcome;
  }

  // Fail closed: an outcome no branch above understands never signs the user in.
  if (outcome.kind !== 'continue') {
    throw apiError({
      status: 500,
      statusText: 'Internal Server Error',
      message: 'Internal Server Error. The sign-in could not be completed.',
      code: 'LOGIN_POLICY_UNKNOWN_OUTCOME',
    });
  }

  await finishSignIn(event, { user, method, ...methodEvidence });
  return outcome;
}

/**
 * Records a sign-in every policy has allowed and writes its session. A sign-in
 * held by a policy step (a second factor) finishes here once the step passes,
 * so the hook and `lastLoginAt` run once per sign-in.
 */
export async function finishSignIn(event: H3Event, evidence: SignInEvidence): Promise<void> {
  await useNitroApp().hooks.callHook('auth:signed-in', evidence);

  // The returned row includes what the hook changed, e.g. a newly granted isAdmin.
  const user = await userService.update({ id: evidence.user.id, lastLoginAt: new Date() });
  if (!user) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'User not found.',
      code: 'USER_NOT_FOUND',
    });
  }

  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      isAdmin: user.isAdmin,
      skipLockOnInit: true, // Bypass lock screen initial check on fresh login
    },
  });
}
