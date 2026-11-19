import type { SignInEvidence } from '#layers/auth/types/signInMethods';

/**
 * Decides who becomes an admin. Runs after every successful sign-in, with any sign-in method.
 * Nobody is an admin until you fill this in. Match on what the sign-in proved, for example
 * your GitHub account id:
 *   return signIn.oauth?.provider === 'github' && signIn.oauth.providerAccountId === '1234567';
 * Don't match on user.email alone: users can change it.
 * Returning false never removes an existing admin; use the users panel for that.
 */
// oxlint-disable-next-line no-unused-vars -- the parameter is what the project matches on
export function shouldGrantAdmin(signIn: SignInEvidence): boolean {
  return false;
}
