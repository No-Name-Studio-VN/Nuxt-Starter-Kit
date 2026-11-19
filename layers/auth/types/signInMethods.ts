import type { User } from '#layers/auth/types/auth';
import type { LoginPolicyContext } from '#layers/auth/types/loginPolicies';

/**
 * One way to sign in ('password', 'oauth', 'passkey', ...). Each method layer
 * registers its entry from a Nitro plugin.
 */
export interface SignInMethod {
  id: string;
  /** How many ways in this method gives the user, e.g. linked accounts or passkeys. */
  countCredentials(userId: number): Promise<number>;
  /** Replaces the user's secret, for methods that have one (password). */
  setSecret?(userId: number, secret: string): Promise<void>;
}

/** What a provider proved during this OAuth sign-in. */
export interface OAuthSignInEvidence {
  provider: string;
  providerAccountId: string;
  /** The email the provider returned for this sign-in, not the one stored on the user. */
  email: string;
}

/** What a sign-in proved, handed to the `auth:signed-in` hook. */
export interface SignInEvidence {
  user: User;
  method: string;
  oauth?: OAuthSignInEvidence;
}

export type CompleteSignInOptions = Pick<SignInEvidence, 'method' | 'oauth'> &
  Pick<LoginPolicyContext, 'redirectTo'>;
