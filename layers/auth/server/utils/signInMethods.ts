import { sql } from 'drizzle-orm';
import { apiError } from '#layers/server-core/server/utils/apiResponse';
import type { SignInCredential, SignInMethod } from '#layers/auth/types/signInMethods';

// Filled once by Nitro plugins; shared by every request.
const signInMethods = new Map<string, SignInMethod>();

/** Throws when the id is taken, so no module can silently replace another's method. */
export function registerSignInMethod(method: SignInMethod): void {
  if (signInMethods.has(method.id)) {
    throw new Error(`Sign-in method "${method.id}" is already registered.`);
  }

  signInMethods.set(method.id, method);
}

export function getSignInMethod(id: string): SignInMethod | undefined {
  return signInMethods.get(id);
}

/** How many ways in each registered method gives the user, keyed by method id. */
export async function listUserSignInMethods(userId: number): Promise<Record<string, number>> {
  const entries = await Promise.all(
    [...signInMethods.values()].map(async (method): Promise<[string, number]> => [
      method.id,
      await method.countCredentials(userId),
    ]),
  );

  return Object.fromEntries(entries);
}

export async function countUserCredentials(userId: number): Promise<number> {
  const counts = Object.values(await listUserSignInMethods(userId));
  return counts.reduce((total, count) => total + count, 0);
}

/** Async-only registrars cannot prove another credential exists atomically. */
export function hasOtherSignInMethod(userId: number, excluded: SignInCredential) {
  const counts = [...signInMethods.values()].flatMap((method) => {
    const count = method.countCredentialsQuery?.(
      userId,
      method.id === excluded.methodId ? excluded.credentialId : undefined,
    );
    return count ? [sql`coalesce((${count}), 0)`] : [];
  });
  return sql`(${sql.join([sql`0`, ...counts], sql` + `)}) > 0`;
}

export function onlySignInMethodError() {
  return apiError({
    status: 400,
    statusText: 'Bad Request',
    message: 'Bad Request. This is your only way to sign in. Add another sign-in method before removing it.',
    code: 'ONLY_SIGNIN_METHOD',
  });
}

/** Async compatibility check; new removal paths use hasOtherSignInMethod. */
export async function assertCanRemoveCredential(userId: number): Promise<void> {
  if ((await countUserCredentials(userId)) <= 1) {
    throw onlySignInMethodError();
  }
}
